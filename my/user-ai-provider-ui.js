import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const API = 'https://api.ekodi.kr/api/user-ai';
const cfg = window.EKODI_MY_CONFIG || {};
const enabled = Boolean(cfg.dataEnabled && cfg.supabaseUrl && cfg.supabasePublishableKey);
const sb = enabled ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth:{ detectSessionInUrl:false, persistSession:true } }) : null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

async function sessionToken() {
  if (!sb) return '';
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || '';
}

async function api(path, options = {}) {
  const token = await sessionToken();
  if (!token) throw new Error('Google 로그인 후 사용할 수 있습니다.');
  const response = await fetch(`${API}${path}`, {
    cache:'no-store',
    ...options,
    headers:{ authorization:`Bearer ${token}`, ...(options.body ? {'content-type':'application/json'} : {}), ...(options.headers || {}) },
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

function ensureSection() {
  let section = document.querySelector('#personal-ai');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'personal-ai';
  section.className = 'section personal-ai-section';
  section.innerHTML = `
    <div class="section-head"><div><p class="eyebrow">MY AI · AUTOMATIC</p><h2>내 AI</h2></div><p>처음 한 번만 개인 AI를 연결하면 이후에는 EKODI Core와 AI Gateway가 상황과 비용 정책에 맞게 자동으로 선택합니다.</p></div>
    <div id="personalAiHub" class="personal-ai-hub" aria-live="polite"><div class="empty"><strong>AI 연결 상태를 확인 중입니다.</strong></div></div>`;
  const recommendations = document.querySelector('#recommendations');
  if (recommendations?.parentNode) recommendations.parentNode.insertBefore(section, recommendations.nextSibling);
  else document.querySelector('main')?.prepend(section);
  return section;
}

function providerLabel(provider) {
  return provider.shortLabel || provider.label || provider.id || 'AI';
}

function apiProviderCard(provider) {
  const state = provider.connected ? '연결됨' : provider.connectionReady ? '연결 가능' : '보안 저장소 준비 필요';
  const placeholder = provider.id === 'claude-api' ? 'Claude API Key' : provider.id === 'openai-api' ? 'OpenAI API Key' : 'Gemini API Key';
  const action = provider.connected ? '키 교체' : '연결';
  const form = provider.connectionReady ? `
    <form class="personal-ai-key-form" data-provider-key-form data-provider-id="${esc(provider.id)}">
      <input type="password" name="apiKey" autocomplete="off" minlength="20" maxlength="512" placeholder="${esc(placeholder)}">
      <button class="secondary" type="submit">${action}</button>
      ${provider.connected ? `<button class="ghost" type="button" data-provider-revoke="${esc(provider.id)}">연결 해제</button>` : ''}
    </form>` : '<p class="ai-vault-note">키를 브라우저에 저장하지 않습니다. 서버 암호화 저장소가 활성화된 뒤 연결할 수 있습니다.</p>';
  return `<article class="personal-ai-card" data-provider-card="${esc(provider.id)}">
    <small>${provider.recommended ? '추천 · ' : ''}내 API · EKODI 비용 0원</small>
    <h3>${esc(provider.label)}</h3>
    <p>${esc(provider.help || '본인 API 키를 연결하면 본인 사용량으로 이용합니다.')}</p>
    <span class="ai-state">${esc(state)}</span>
    ${form}
    <a class="text-link" href="${esc(provider.connectUrl || '#')}" target="_blank" rel="noopener noreferrer">API 키 만들기·관리 ↗</a>
  </article>`;
}

function webProviderCard(provider) {
  return `<article class="personal-ai-card"><small>개인 AI 웹</small><h3>${esc(provider.label)}</h3><p>API 연결 없이 본인 계정의 웹 AI에서 계속할 수 있습니다. EKODI가 해당 웹 사용량을 가져오지는 않습니다.</p><a class="secondary" href="${esc(provider.url)}" target="_blank" rel="noopener noreferrer">${esc(provider.label)} 열기 →</a></article>`;
}

function connectionGuide(status) {
  const guide = status.connectionGuide;
  if (!guide) return '';
  const steps = Array.isArray(guide.steps) ? guide.steps : [];
  return `<article class="personal-ai-policy" data-first-ai-guide>
    <div><small>처음 한 번만</small><h3>${esc(guide.title || '내 AI 연결')}</h3><p>${esc(guide.body || '')}</p></div>
    <ol>${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
  </article>`;
}

function renderGuest(host) {
  host.innerHTML = '<div class="empty"><strong>Google 로그인 후 내 AI를 연결할 수 있습니다.</strong><p>연결하지 않아도 EKODI Core 기본 기능은 계속 사용할 수 있습니다.</p></div>';
}

function fundingLabel(result) {
  if (result.funding === 'personal') return '내 AI · EKODI 비용 0원';
  if (result.funding === 'ekodi') return 'EKODI 회원 지원 AI';
  return result.mode === 'core-only' ? 'EKODI Core · AI 미사용' : '개인 AI에서 계속';
}

function renderAssistResult(host, result, prompt) {
  const resultHost = host.querySelector('#personalAiResult');
  if (!resultHost) return;
  const quota = result.quota ? `<span>지원 잔여 ${Number(result.quota.remaining || 0)} / ${Number(result.quota.monthly || 0)}회</span>` : '';
  const handoffs = Array.isArray(result.handoffs) ? result.handoffs : [];
  const source = result.providerLabel || result.provider || result.model || '';
  resultHost.hidden = false;
  resultHost.innerHTML = `
    <div class="personal-ai-result-head"><strong>${esc(fundingLabel(result))}</strong><span>${esc(source)}</span>${quota}</div>
    <p class="personal-ai-result-text">${esc(result.text || '')}</p>
    ${result.notice ? `<p class="personal-ai-result-notice">${esc(result.notice)}</p>` : ''}
    ${handoffs.length ? `<div class="personal-ai-handoffs">${handoffs.map(item => `<button type="button" class="secondary" data-personal-handoff-url="${esc(item.url)}">질문 복사 + ${esc(item.label)} 열기</button>`).join('')}</div>` : ''}`;
  resultHost.querySelectorAll('[data-personal-handoff-url]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    window.open(button.dataset.personalHandoffUrl, '_blank', 'noopener,noreferrer');
  }));
}

function providerOptions(status) {
  return (status.providers || []).map(provider => `<option value="${esc(provider.id)}">${esc(providerLabel(provider))}${provider.kind === 'personal-web' ? ' 웹' : ' 내 API'}</option>`).join('');
}

function renderStatus(host, status) {
  const pref = status.preference || { mode:'auto', preferredProvider:'gemini-api' };
  const plan = status.plan || {};
  const isFreeLike = ['free','flex'].includes(String(plan.planId || 'free'));
  const providers = status.providers || [];
  const apiProviders = providers.filter(provider => provider.kind === 'personal-api');
  const webProviders = providers.filter(provider => provider.kind === 'personal-web');
  const connected = apiProviders.filter(provider => provider.connected);
  const connectedText = connected.length ? connected.map(providerLabel).join(' · ') : '개인 AI 미연결';
  const hasConnected = connected.length > 0;
  const setupContent = `
    <div class="personal-ai-grid">${apiProviders.map(apiProviderCard).join('')}</div>
    <div class="personal-ai-grid">${webProviders.map(webProviderCard).join('')}</div>`;

  host.innerHTML = `
    ${connectionGuide(status)}
    <article class="personal-ai-console">
      <div class="personal-ai-console-copy"><small>EKODI User AI · ${esc(connectedText)}</small><h3>무엇을 도와드릴까요?</h3><p>${hasConnected ? '연결된 개인 AI를 기본으로 사용하고 EKODI가 적절한 경로를 자동 선택합니다.' : '개인 AI가 없어도 EKODI Core는 계속 작동하며, 필요하면 개인 AI 웹으로 이어드립니다.'}</p></div>
      <form id="personalAiAskForm" class="personal-ai-ask"><textarea name="message" rows="3" maxlength="4000" placeholder="예: 오늘 내가 먼저 확인할 일을 정리해줘" required></textarea><button class="primary" type="submit">AI에게 묻기</button></form>
      <div id="personalAiResult" class="personal-ai-result" hidden></div>
    </article>
    <article class="personal-ai-policy">
      <div><small>현재 AI 사용 상태</small><h3>${isFreeLike ? `${esc(String(plan.planId || 'FREE').toUpperCase())} · EKODI API 비용 0원` : `${esc(String(plan.planId || '').toUpperCase())} · EKODI 지원량 적용`}</h3><p>${isFreeLike ? `${esc(connectedText)} · AI가 없으면 Core-only` : `개인 AI 우선 · 이번 달 EKODI 지원 ${Number(plan.sponsoredUsed || 0)} / ${Number(plan.sponsoredRequests || 0)}회 사용`}</p></div>
      <form id="personalAiPreferenceForm" class="personal-ai-preference">
        <label>사용 방식<select name="mode"><option value="auto">자동 선택</option><option value="personal-first">내 AI 우선</option><option value="ekodi-first">EKODI 지원량 우선</option><option value="off">AI 사용 안 함</option></select></label>
        <label>기본 AI<select name="preferredProvider">${providerOptions(status)}</select></label>
        <button class="secondary" type="submit">설정 저장</button>
      </form>
    </article>
    ${hasConnected ? `<details class="personal-ai-policy"><summary>AI 연결 변경</summary>${setupContent}</details>` : setupContent}
    <div class="personal-ai-privacy"><strong>개인정보 보호</strong><span>API 키는 브라우저에 보관하지 않고 서버에서 암호화합니다. 민감정보는 개인 무료 AI로 자동 전송하지 않으며, AI가 없어도 EKODI Core는 계속 작동합니다.</span></div>`;

  const askForm = host.querySelector('#personalAiAskForm');
  if (askForm) askForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = askForm.elements.message.value.trim();
    const button = askForm.querySelector('button[type="submit"]');
    const resultHost = host.querySelector('#personalAiResult');
    if (!message || !button) return;
    button.disabled = true;
    button.textContent = '자동 연결 중…';
    if (resultHost) { resultHost.hidden = false; resultHost.innerHTML = '<p class="personal-ai-result-text">Core와 연결된 AI 경로를 확인하고 있습니다.</p>'; }
    try {
      const result = await api('/assist', { method:'POST', body:JSON.stringify({ message, site:'my', dataClass:'general' }) });
      renderAssistResult(host, result, message);
      if (result.funding === 'ekodi' && result.quota) {
        const policyCopy = host.querySelector('.personal-ai-policy p');
        if (policyCopy) policyCopy.textContent = `이번 달 EKODI 지원 ${Number(result.quota.used || 0)} / ${Number(result.quota.monthly || 0)}회 사용`;
      }
    } catch (error) {
      if (resultHost) resultHost.innerHTML = `<p class="personal-ai-result-notice">${esc(error.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = 'AI에게 묻기';
    }
  });

  const form = host.querySelector('#personalAiPreferenceForm');
  if (form) {
    form.elements.mode.value = pref.mode || 'auto';
    if ([...form.elements.preferredProvider.options].some(option => option.value === pref.preferredProvider)) form.elements.preferredProvider.value = pref.preferredProvider;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api('/preferences', { method:'PUT', body:JSON.stringify({ mode:form.elements.mode.value, preferredProvider:form.elements.preferredProvider.value }) });
        button.textContent = '저장됨';
      } catch (error) { button.textContent = error.message; }
      finally { setTimeout(() => { button.disabled = false; button.textContent = '설정 저장'; }, 1200); }
    });
  }

  host.querySelectorAll('[data-provider-key-form]').forEach(keyForm => keyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const providerId = keyForm.dataset.providerId;
    const input = keyForm.elements.apiKey;
    const button = keyForm.querySelector('button[type="submit"]');
    const apiKey = input.value.trim();
    if (!providerId || !apiKey || !button) return;
    button.disabled = true;
    button.textContent = '연결 확인 중…';
    try {
      await api(`/connections/${encodeURIComponent(providerId)}`, { method:'POST', body:JSON.stringify({ apiKey }) });
      input.value = '';
      await api('/preferences', { method:'PUT', body:JSON.stringify({ mode:'auto', preferredProvider:providerId }) });
      await refresh(host);
    } catch (error) { button.textContent = error.message; }
    finally { button.disabled = false; }
  }));

  host.querySelectorAll('[data-provider-revoke]').forEach(button => button.addEventListener('click', async () => {
    const providerId = button.dataset.providerRevoke;
    if (!providerId) return;
    button.disabled = true;
    try { await api(`/connections/${encodeURIComponent(providerId)}`, { method:'DELETE' }); await refresh(host); }
    catch (error) { button.textContent = error.message; button.disabled = false; }
  }));
}

async function refresh(host) {
  const token = await sessionToken();
  if (!token) { renderGuest(host); return; }
  try { renderStatus(host, await api('/status?site=my')); }
  catch (error) { host.innerHTML = `<div class="empty"><strong>AI 연결 상태를 불러오지 못했습니다.</strong><p>${esc(error.message)}</p></div>`; }
}

export async function initPersonalAiHub() {
  const section = ensureSection();
  const host = section.querySelector('#personalAiHub');
  if (!host) return;
  if (!enabled) { host.innerHTML = '<div class="empty"><strong>격리 모드에서는 실제 AI 계정을 연결하지 않습니다.</strong></div>'; return; }
  await refresh(host);
  sb?.auth.onAuthStateChange(() => setTimeout(() => refresh(host), 0));
}
