(() => {
  'use strict';

  const TAB_KEY = 'channels';
  const API = 'https://marketing-connect-api.ekodi.kr';
  const STYLE_ID = 'marketingGrowthConnectorStyle';
  let loading = false;
  let installed = false;
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const stateLabel = value => ({active:'연결됨',expired:'만료',revoked:'해제',error:'오류',paused:'중지',draft:'초안',ready:'승인됨',completed:'완료',failed:'실패',approved:'승인',rejected:'거절'})[String(value || '').toLowerCase()] || String(value || '확인중');
  const providerLabel = value => ({facebook:'Facebook',instagram:'Instagram',threads:'Threads',facebook_ads:'Meta 광고'})[String(value || '').toLowerCase()] || String(value || '채널');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .growth-hub{display:grid;gap:11px}.growth-hero,.growth-card,.growth-summary article{border:1px solid #193852;border-radius:11px;background:#081827}.growth-hero{padding:13px;display:grid;gap:6px}.growth-hero h3{margin:0;color:#e7f3fb;font-size:10px}.growth-hero p{margin:0;color:#7892a7;font-size:6.3px;line-height:1.6}.growth-chip{display:inline-flex;width:max-content;padding:3px 6px;border:1px solid #286555;border-radius:999px;background:#11352e;color:#8ed2b8;font-size:5.8px;font-weight:900}.growth-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.growth-summary article{padding:10px}.growth-summary small{display:block;color:#718aa0;font-size:5.8px}.growth-summary strong{display:block;margin-top:3px;color:#dcecf7;font-size:13px}.growth-connectors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.growth-card{padding:11px}.growth-card h4{margin:0 0 5px;color:#dbeaf6;font-size:8px}.growth-card p{margin:0 0 8px;color:#71899e;font-size:5.9px;line-height:1.5}.growth-card button,.growth-form button,.growth-action{min-height:29px;padding:0 10px;border:1px solid #285173;border-radius:7px;background:#0d2940;color:#bdd9eb;font-size:6px;font-weight:900;cursor:pointer}.growth-card button:disabled,.growth-form button:disabled{opacity:.45;cursor:not-allowed}.growth-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.growth-card header{display:flex;align-items:center;justify-content:space-between;gap:7px}.growth-state{display:inline-flex;padding:3px 6px;border:1px solid #3a5368;border-radius:999px;color:#9ab1c2;font-size:5.4px;font-weight:900}.growth-state.active,.growth-state.ready,.growth-state.approved{border-color:#2e6757;background:#12372e;color:#90d3bb}.growth-state.failed,.growth-state.error{border-color:#743f43;background:#351a1d;color:#f1a7ad}.growth-state.draft,.growth-state.paused{border-color:#6f5739;background:#342719;color:#e9c183}.growth-list{display:grid;gap:5px;margin-top:7px}.growth-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:7px;border:1px solid #17354d;border-radius:8px;background:#071723}.growth-row strong{display:block;color:#d0e2ef;font-size:6.8px}.growth-row span,.growth-row small,.growth-row a{color:#70899d;font-size:5.6px}.growth-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}.growth-empty{padding:10px;border:1px dashed #29465e;border-radius:8px;color:#7890a5;font-size:6px;line-height:1.55}.growth-form{display:grid;gap:7px;margin-top:7px}.growth-form label{display:grid;gap:3px;color:#7d95a8;font-size:5.8px}.growth-form input,.growth-form textarea,.growth-form select{width:100%;padding:6px 7px;border:1px solid #25445e;border-radius:7px;background:#07131f;color:#d7e8f5;font-size:6.4px}.growth-form textarea{min-height:74px;resize:vertical}.growth-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.growth-full{grid-column:1/-1}.growth-checks{display:grid;gap:5px}.growth-check{display:flex!important;grid-template-columns:none!important;flex-direction:row;align-items:center;gap:6px!important;padding:6px;border:1px solid #1c3b53;border-radius:7px;background:#071723}.growth-check input{width:auto}.growth-note{padding:8px;border:1px solid #28534a;border-radius:8px;background:#0d2421;color:#7fac9e;font-size:5.8px;line-height:1.55}.growth-result{min-height:18px;color:#8db7d3;font-size:6px}.growth-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.growth-platform-alert{padding:9px;border:1px solid #755535;border-radius:9px;background:#332516;color:#eac18a;font-size:5.9px;line-height:1.55}
      @media(max-width:1080px){.growth-connectors{grid-template-columns:1fr 1fr}.growth-grid{grid-template-columns:1fr}.growth-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.growth-connectors,.growth-summary,.growth-form-grid{grid-template-columns:1fr}.growth-full{grid-column:auto}}
    `;
    document.head.append(style);
  }

  function endpoint(path) {
    const url = new URL(`${API}${path}`);
    url.searchParams.set('subject_type','person');
    return url.href;
  }
  async function request(path,{method='GET',body}={}) {
    const headers = new Headers();
    if (token()) headers.set('authorization',`Bearer ${token()}`);
    if (body !== undefined) headers.set('content-type','application/json');
    const response = await fetch(endpoint(path),{method,headers,body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || data.error || `요청 실패 (${response.status})`);
      error.data = data;
      throw error;
    }
    return data;
  }
  function currentReturnUrl() {
    const url = new URL(location.href);
    ['ekodi_connect','provider','connections','reason'].forEach(key => url.searchParams.delete(key));
    return url.href;
  }
  function callbackNotice() {
    const url = new URL(location.href);
    const status = url.searchParams.get('ekodi_connect');
    if (!status) return '';
    const provider = url.searchParams.get('provider') || '계정';
    if (status === 'success') return `<div class="growth-note">${esc(providerLabel(provider))} 인증이 완료되었습니다. 연결된 계정 정보를 자동으로 불러왔습니다.</div>`;
    return `<div class="growth-platform-alert">계정 인증을 완료하지 못했습니다. ${esc(url.searchParams.get('reason') || '권한 또는 앱 설정을 확인하세요.')}</div>`;
  }
  function connectionRows(connections) {
    if (!connections.length) return '<div class="growth-empty">아직 연결된 계정이 없습니다. 인증키나 Page ID를 입력하지 말고 위의 연결 버튼에서 공식 로그인만 진행하면 됩니다.</div>';
    return `<div class="growth-list">${connections.map(row => `<article class="growth-row"><div><strong>${esc(row.display_name || providerLabel(row.provider))}</strong><div class="growth-meta"><span>${esc(providerLabel(row.provider))} · ${esc(row.resource_type)}</span><small>${esc(row.external_id)}</small><small>확인 ${esc(dateText(row.last_check_at || row.updated_at))}</small></div>${row.last_error ? `<small>${esc(row.last_error)}</small>` : ''}</div><span class="growth-state ${esc(row.status)}">${esc(stateLabel(row.status))}</span></article>`).join('')}</div>`;
  }
  function channelChecks(connections) {
    const rows = connections.filter(row => ['facebook','instagram','threads'].includes(row.provider) && row.status === 'active');
    if (!rows.length) return '<div class="growth-empty">게시할 계정을 먼저 연결하세요.</div>';
    return `<div class="growth-checks">${rows.map(row => `<label class="growth-check"><input type="checkbox" name="connectionIds" value="${Number(row.id)}" checked><span>${esc(providerLabel(row.provider))} · ${esc(row.display_name)}</span></label>`).join('')}</div>`;
  }
  function adOptions(connections) {
    const rows = connections.filter(row => row.provider === 'facebook_ads' && row.status === 'active');
    if (!rows.length) return '<option value="">광고계정 연결 필요</option>';
    return `<option value="">광고계정 선택</option>${rows.map(row => `<option value="${Number(row.id)}">${esc(row.display_name)} · ${esc(row.external_id)}</option>`).join('')}`;
  }
  function campaignRows(campaigns) {
    if (!campaigns.length) return '<div class="growth-empty">아직 홍보 캠페인이 없습니다. 무료 홍보는 즉시 게시할 수 있고, 유료 홍보는 먼저 초안으로 저장됩니다.</div>';
    return `<div class="growth-list">${campaigns.slice(0,20).map(row => `<article class="growth-row"><div><strong>${esc(row.name)}</strong><div class="growth-meta"><span>${row.mode === 'paid' ? '유료 홍보' : '무료 홍보'}</span><span>${row.mode === 'paid' ? `${esc(money(row.daily_budget_krw))}/일 · 총 ${esc(money(row.total_budget_krw))}` : esc(row.utm_campaign || '')}</span><small>${esc(dateText(row.updated_at))}</small></div>${row.last_error ? `<small>${esc(row.last_error)}</small>` : ''}${row.external_campaign_id ? `<small>Meta Campaign ${esc(row.external_campaign_id)} · PAUSED</small>` : ''}${row.mode === 'paid' && row.approval_state === 'draft' ? `<div class="growth-actions"><button class="growth-action" type="button" data-approve-campaign="${Number(row.id)}">광고비 승인</button></div>` : ''}${row.mode === 'paid' && row.approval_state === 'approved' && !row.external_campaign_id ? `<div class="growth-actions"><button class="growth-action" type="button" data-prepare-campaign="${Number(row.id)}">Meta에 PAUSED 생성</button></div>` : ''}</div><span class="growth-state ${esc(row.status)}">${esc(stateLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  async function connect(provider,mode='publish') {
    const path = provider === 'threads' ? '/v1/connect/threads/start' : '/v1/connect/meta/start';
    const data = await request(path,{method:'POST',body:{mode,returnUrl:currentReturnUrl()}});
    if (!data.authorizationUrl) throw new Error('인증 주소를 받지 못했습니다.');
    location.assign(data.authorizationUrl);
  }
  function selectedIds(form) { return [...form.querySelectorAll('input[name="connectionIds"]:checked')].map(input => Number(input.value)).filter(Number.isInteger); }
  function formValue(form,name) { return String(new FormData(form).get(name) || '').trim(); }
  function setResult(form,message,error=false) {
    const node = form.querySelector('.growth-result');
    if (node) { node.textContent = message; node.style.color = error ? '#f1a7ad' : '#8db7d3'; }
  }

  async function renderManager() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view || !tab.classList.contains('active') || loading) return;
    tab.textContent = '게시 · 홍보';
    ensureStyles();
    loading = true;
    view.innerHTML = '<div class="growth-empty">게시·홍보 연결상태를 확인하는 중입니다.</div>';
    try {
      if (!token()) throw new Error('관리자 로그인이 필요합니다.');
      const [connectionData,campaignData] = await Promise.all([request('/v1/connections'),request('/v1/promotions')]);
      const connections = Array.isArray(connectionData.connections) ? connectionData.connections : [];
      const campaigns = Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [];
      const activePublish = connections.filter(row => ['facebook','instagram','threads'].includes(row.provider) && row.status === 'active').length;
      const adAccounts = connections.filter(row => row.provider === 'facebook_ads' && row.status === 'active').length;
      const organic = campaigns.filter(row => row.mode === 'organic').length;
      const paid = campaigns.filter(row => row.mode === 'paid').length;
      const platform = connectionData.platform || {};
      const platformAlert = (!platform.metaConfigured || !platform.threadsConfigured) ? `<div class="growth-platform-alert"><b>최초 1회 플랫폼 설정 필요</b><br>사용자별 인증키 입력은 없앴습니다. 다만 에코디 전체가 사용할 공식 앱 식별정보가 아직 등록되지 않은 서비스는 연결 버튼이 잠깁니다. Meta 앱 설정은 시스템 전체에서 한 번만 완료하면 이후 모든 사용자는 로그인 승인만 합니다.</div>` : '';

      view.innerHTML = `<div class="growth-hub" data-growth-hub>
        <section class="growth-hero"><span class="growth-chip">중앙 OAuth · 암호화 Vault · 무료 직접 게시</span><h3>게시 · 홍보 연결센터</h3><p>인증키, Access Token, Page ID를 복사하지 않습니다. 공식 계정으로 로그인하면 에코디가 권한·계정발견·토큰보관·게시·유입추적을 한 흐름으로 처리합니다. Metricool은 필수가 아닙니다.</p></section>
        ${callbackNotice()}${platformAlert}
        <div class="growth-summary"><article><small>게시 연결</small><strong>${activePublish}</strong></article><article><small>광고계정</small><strong>${adAccounts}</strong></article><article><small>무료 홍보</small><strong>${organic}</strong></article><article><small>유료 초안</small><strong>${paid}</strong></article></div>
        <div class="growth-connectors">
          <section class="growth-card"><header><h4>Meta 통합 연결</h4><span class="growth-state ${platform.metaConfigured ? 'active' : 'draft'}">${platform.metaConfigured ? '준비됨' : '앱 설정 필요'}</span></header><p>Facebook 페이지와 연결된 Instagram 비즈니스 계정을 한 번의 Meta 승인으로 자동 검색·연결합니다.</p><button type="button" data-connect="meta" ${platform.metaConfigured ? '' : 'disabled'}>Meta로 계속</button></section>
          <section class="growth-card"><header><h4>Threads 연결</h4><span class="growth-state ${platform.threadsConfigured ? 'active' : 'draft'}">${platform.threadsConfigured ? '준비됨' : '앱 설정 필요'}</span></header><p>Threads 공식 로그인으로 프로필을 연결합니다. 토큰은 암호화 Vault에만 보관됩니다.</p><button type="button" data-connect="threads" ${platform.threadsConfigured ? '' : 'disabled'}>Threads로 계속</button></section>
          <section class="growth-card"><header><h4>유료 홍보 권한</h4><span class="growth-state ${adAccounts ? 'active' : 'draft'}">${adAccounts ? `${adAccounts} 계정` : '선택 연결'}</span></header><p>Meta 광고계정 권한을 연결합니다. 광고 캠페인은 승인 후에도 PAUSED로만 생성해 예기치 않은 과금을 막습니다.</p><button type="button" data-connect-paid ${platform.metaConfigured ? '' : 'disabled'}>Meta 광고계정 연결</button></section>
        </div>
        <section class="growth-card"><h4>연결된 계정</h4>${connectionRows(connections)}</section>
        <div class="growth-grid">
          <section class="growth-card"><h4>무료 게시 · 홍보 실행</h4><p>연결 채널을 고르면 UTM을 자동 부착해 실제 게시하고, 성공·실패 URL을 에코디에 기록합니다.</p><form class="growth-form" data-organic-form>${channelChecks(connections)}<div class="growth-form-grid"><label class="growth-full">캠페인 이름<input name="name" required maxlength="120" placeholder="예: 에코디몰 오늘의 발견"></label><label class="growth-full">게시문<textarea name="caption" required maxlength="12000" placeholder="홍보 문구"></textarea></label><label>유입 링크<input name="targetUrl" type="url" placeholder="https://ekodi.kr/mall"></label><label>이미지 URL<input name="imageUrl" type="url" placeholder="Instagram 선택 시 필요"></label></div><div class="growth-note">무료 홍보는 광고비 0원입니다. Facebook·Instagram·Threads마다 UTM source를 자동 구분해 유입을 추적합니다.</div><button type="submit" ${activePublish ? '' : 'disabled'}>게시 · 무료 홍보 실행</button><div class="growth-result"></div></form></section>
          <section class="growth-card"><h4>유료 홍보 초안</h4><p>예산·목표만 먼저 기록합니다. 초안 생성만으로는 1원도 집행되지 않습니다.</p><form class="growth-form" data-paid-form><div class="growth-form-grid"><label class="growth-full">광고계정<select name="adAccountConnectionId" required>${adOptions(connections)}</select></label><label class="growth-full">캠페인 이름<input name="name" required maxlength="120" placeholder="예: 에코디몰 유입 캠페인"></label><label class="growth-full">목표 URL<input name="targetUrl" required type="url" placeholder="https://ekodi.kr/mall"></label><label>일 예산<input name="dailyBudgetKrw" required type="number" min="1000" step="1000" value="5000"></label><label>총 예산<input name="totalBudgetKrw" required type="number" min="1000" step="1000" value="30000"></label><label class="growth-full">광고 문안<textarea name="caption" maxlength="12000" placeholder="광고 소재 문안"></textarea></label></div><div class="growth-note">안전장치: 초안 → 명시적 광고비 승인 → Meta에 PAUSED 캠페인 생성. 현재 자동 활성화는 의도적으로 막아두었습니다.</div><button type="submit" ${adAccounts ? '' : 'disabled'}>유료 홍보 초안 만들기</button><div class="growth-result"></div></form></section>
        </div>
        <section class="growth-card"><h4>홍보 활동 내역</h4>${campaignRows(campaigns)}</section>
      </div>`;

      view.querySelector('[data-connect="meta"]')?.addEventListener('click',() => connect('meta').catch(error => alert(error.message)));
      view.querySelector('[data-connect="threads"]')?.addEventListener('click',() => connect('threads').catch(error => alert(error.message)));
      view.querySelector('[data-connect-paid]')?.addEventListener('click',() => connect('meta','paid').catch(error => alert(error.message)));
      view.querySelector('[data-organic-form]')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setResult(form,'실제 게시와 추적 링크를 생성하는 중입니다.');
        try {
          const body = {mode:'organic',name:formValue(form,'name'),targetUrl:formValue(form,'targetUrl'),connectionIds:selectedIds(form),executeNow:true,content:{caption:formValue(form,'caption'),imageUrl:formValue(form,'imageUrl'),linkUrl:formValue(form,'targetUrl')}};
          const data = await request('/v1/promotions',{method:'POST',body});
          const results = data.publication?.results || [];
          const success = results.filter(row => row.status === 'published').length;
          const failed = results.filter(row => row.status === 'failed').length;
          setResult(form,`게시 완료 ${success}건${failed ? ` · 실패 ${failed}건` : ''}. 활동 내역을 새로 불러옵니다.`);
          setTimeout(() => { loading = false; renderManager(); },500);
        } catch (error) { setResult(form,error.message,true); button.disabled = false; }
      });
      view.querySelector('[data-paid-form]')?.addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setResult(form,'광고비가 발생하지 않는 초안을 저장하는 중입니다.');
        try {
          const body = {mode:'paid',name:formValue(form,'name'),targetUrl:formValue(form,'targetUrl'),objective:'traffic',dailyBudgetKrw:Number(formValue(form,'dailyBudgetKrw')),totalBudgetKrw:Number(formValue(form,'totalBudgetKrw')),adAccountConnectionId:Number(formValue(form,'adAccountConnectionId')),content:{caption:formValue(form,'caption'),linkUrl:formValue(form,'targetUrl')}};
          const data = await request('/v1/promotions',{method:'POST',body});
          setResult(form,`초안 #${data.campaignId} 저장 완료 · 현재 집행액 0원`);
          setTimeout(() => { loading = false; renderManager(); },500);
        } catch (error) { setResult(form,error.message,true); button.disabled = false; }
      });
      view.querySelectorAll('[data-approve-campaign]').forEach(button => button.addEventListener('click',async () => {
        if (!confirm('이 캠페인의 광고비 집행 준비를 승인할까요? 아직 광고는 활성화되지 않습니다.')) return;
        button.disabled = true;
        try { await request(`/v1/promotions/${button.dataset.approveCampaign}/approve`,{method:'POST',body:{approvalText:'광고비 집행 승인'}}); loading = false; renderManager(); }
        catch (error) { alert(error.message); button.disabled = false; }
      }));
      view.querySelectorAll('[data-prepare-campaign]').forEach(button => button.addEventListener('click',async () => {
        button.disabled = true;
        try { const data = await request(`/v1/promotions/${button.dataset.prepareCampaign}/prepare`,{method:'POST',body:{}}); alert(`${data.note || 'Meta 캠페인 준비 완료'}\n집행액: ${money(data.spendKrw)}`); loading = false; renderManager(); }
        catch (error) { alert(error.message); button.disabled = false; }
      }));
    } catch (error) {
      view.innerHTML = `<div class="growth-platform-alert">게시·홍보 연결센터를 불러오지 못했습니다. ${esc(error.message)}</div>`;
    } finally { loading = false; }
  }

  function install() {
    if (installed) return;
    installed = true;
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('#marketingAiAdminPanel');
      if (!panel) return;
      const tab = panel.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
      if (tab && tab.classList.contains('active')) queueMicrotask(renderManager);
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',event => {
      const tab = event.target.closest?.(`[data-marketing-tab="${TAB_KEY}"]`);
      if (tab) setTimeout(renderManager,0);
    });
    setTimeout(renderManager,100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
