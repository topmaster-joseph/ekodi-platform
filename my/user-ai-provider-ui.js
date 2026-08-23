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
    <div class="section-head"><div><p class="eyebrow">MY AI · PERSONAL FIRST</p><h2>내 AI</h2></div><p>무료회원은 내 무료 AI를 우선 사용하고, EKODI 유료 API 비용은 자동으로 발생시키지 않습니다. 유료 플랜은 정해진 지원량 안에서만 EKODI AI를 사용할 수 있습니다.</p></div>
    <div id="personalAiHub" class="personal-ai-hub" aria-live="polite"><div class="empty"><strong>AI 연결 상태를 확인 중입니다.</strong></div></div>`;
  const recommendations = document.querySelector('#recommendations');
  if (recommendations?.parentNode) recommendations.parentNode.insertBefore(section, recommendations.nextSibling);
  else document.querySelector('main')?.prepend(section);
  return section;
}

function providerCard(provider) {
  if (provider.kind === 'personal-web') {
    return `<article class="personal-ai-card"><small>개인 무료 AI</small><h3>${esc(provider.label)}</h3><p>사용자 본인의 ${esc(provider.label)} 계정과 무료/유료 사용권을 그대로 사용합니다. EKODI API 비용은 0원입니다.</p><a class="primary" href="${esc(provider.url)}" target="_blank" rel="noopener noreferrer">${esc(provider.label)}에서 계속 →</a></article>`;
  }
  const state = provider.connected ? '연결됨' : provider.connectionReady ? '연결 가능' : '보안 저장소 준비 필요';
  return `<article class="personal-ai-card"><small>내 API · EKODI 비용 0원</small><h3>${esc(provider.label)}</h3><p>Google AI Studio의 본인 API 키를 서버에서 암호화해 보관하고, 본인 사용량으로 호출합니다.</p><span class="ai-state">${esc(state)}</span>${provider.connectionReady ? `<form class="personal-ai-key-form" data-gemini-key-form><input type="password" name="apiKey" autocomplete="off" minlength="20" maxlength="256" placeholder="Gemini API Key"><button class="secondary" type="submit">${provider.connected ? '키 교체' : '연결'}</button>${provider.connected ? '<button class="ghost" type="button" data-gemini-revoke>연결 해제</button>' : ''}</form>` : '<p class="ai-vault-note">키를 브라우저에 저장하지 않습니다. 서버 암호화 저장소가 활성화된 뒤 연결 버튼이 열립니다.</p>'}<a class="text-link" href="${esc(provider.url)}" target="_blank" rel="noopener noreferrer">Google AI Studio에서 키 관리 ↗</a></article>`;
}

function renderGuest(host) {
  host.innerHTML = '<div class="empty"><strong>Google 로그인 후 내 AI를 선택할 수 있습니다.</strong><p>무료회원도 EKODI가 유료 API를 대신 호출하지 않도록 개인 AI 우선 원칙이 적용됩니다.</p></div>';
}

function fundingLabel(result) {
  if (result.funding === 'personal') return '내 AI · EKODI 비용 0원';
  if (result.funding === 'ekodi') return 'EKODI 회원 지원 AI';
  return result.mode === 'core-only' ? 'AI 없이 Core 모드' : '개인 AI에서 계속';
}

function renderAssistResult(host, result, prompt) {
  const resultHost = host.querySelector('#personalAiResult');
  if (!resultHost) return;
  const quota = result.quota ? `<span>지원 잔여 ${Number(result.quota.remaining || 0)} / ${Number(result.quota.monthly || 0)}회</span>` : '';
  const handoffs = Array.isArray(result.handoffs) ? result.handoffs : [];
  resultHost.hidden = false;
  resultHost.innerHTML = `
    <div class="personal-ai-result-head"><strong>${esc(fundingLabel(result))}</strong><span>${esc(result.provider || result.model || '')}</span>${quota}</div>
    <p class="personal-ai-result-text">${esc(result.text || '')}</p>
    ${result.notice ? `<p class="personal-ai-result-notice">${esc(result.notice)}</p>` : ''}
    ${handoffs.length ? `<div class="personal-ai-handoffs">${handoffs.map(item => `<button type="button" class="secondary" data-personal-handoff-url="${esc(item.url)}">질문 복사 + ${esc(item.label)} 열기</button>`).join('')}</div>` : ''}`;
  resultHost.querySelectorAll('[data-personal-handoff-url]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    window.open(button.dataset.personalHandoffUrl, '_blank', 'noopener,noreferrer');
  }));
}

function renderStatus(host, status) {
  const pref = status.preference || { mode:'auto', preferredProvider:'gemini-api' };
  const plan = status.plan || {};
  const isFree = String(plan.planId || 'free') === 'free';
  host.innerHTML = `
    <article class="personal-ai-console">
      <div class="personal-ai-console-copy"><small>EKODI User AI</small><h3>무엇을 도와드릴까요?</h3><p>연결된 내 AI를 먼저 사용합니다. 내 AI가 없고 FREE라면 EKODI 유료 API 대신 개인 AI 화면으로 이어드립니다.</p></div>
      <form id="personalAiAskForm" class="personal-ai-ask"><textarea name="message" rows="3" maxlength="4000" placeholder="예: 오늘 내가 먼저 확인할 일을 정리해줘" required></textarea><button class="primary" type="submit">AI에게 묻기</button></form>
      <div id="personalAiResult" class="personal-ai-result" hidden></div>
    </article>
    <article class="personal-ai-policy">
      <div><small>현재 AI 비용 정책</small><h3>${isFree ? 'FREE · EKODI API 비용 0원' : `${esc(String(plan.planId || '').toUpperCase())} · EKODI 지원량 적용`}</h3><p>${isFree ? '내 AI를 우선 사용하며 EKODI 유료 API로 자동 전환하지 않습니다.' : `이번 달 EKODI 지원 ${Number(plan.sponsoredUsed || 0)} / ${Number(plan.sponsoredRequests || 0)}회 사용`}</p></div>
      <form id="personalAiPreferenceForm" class="personal-ai-preference">
        <label>사용 방식<select name="mode"><option value="auto">자동 · 내 AI 우선</option><option value="personal-first">항상 내 AI 우선</option><option value="ekodi-first">EKODI 지원량 우선</option><option value="off">AI 사용 안 함</option></select></label>
        <label>기본 AI<select name="preferredProvider"><option value="gemini-api">Gemini 내 API</option><option value="gemini-web">Gemini 웹</option><option value="chatgpt-web">ChatGPT 웹</option></select></label>
        <button class="secondary" type="submit">설정 저장</button>
      </form>
    </article>
    <div class="personal-ai-grid">${(status.providers || []).map(providerCard).join('')}</div>
    <div class="personal-ai-privacy"><strong>개인정보 보호</strong><span>비밀번호·API 키·주민번호·카드·계좌 등 민감정보는 개인 무료 API로 자동 전송하지 않습니다. AI가 없어도 EKODI Core는 계속 작동합니다.</span></div>`;

  const askForm = host.querySelector('#personalAiAskForm');
  if (askForm) askForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = askForm.elements.message.value.trim();
    const button = askForm.querySelector('button[type="submit"]');
    const resultHost = host.querySelector('#personalAiResult');
    if (!message || !button) return;
    button.disabled = true;
    button.textContent = '연결 경로 확인 중…';
    if (resultHost) { resultHost.hidden = false; resultHost.innerHTML = '<p class="personal-ai-result-text">내 AI와 회원 지원량을 확인하고 있습니다.</p>'; }
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
    form.elements.preferredProvider.value = pref.preferredProvider || 'gemini-api';
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
  const keyForm = host.querySelector('[data-gemini-key-form]');
  if (keyForm) keyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const input = keyForm.elements.apiKey;
    const button = keyForm.querySelector('button[type="submit"]');
    const apiKey = input.value.trim();
    if (!apiKey) return;
    button.disabled = true;
    try {
      await api('/credentials/gemini', { method:'POST', body:JSON.stringify({ apiKey }) });
      input.value = '';
      await refresh(host);
    } catch (error) { button.textContent = error.message; }
    finally { button.disabled = false; }
  });
  const revoke = host.querySelector('[data-gemini-revoke]');
  if (revoke) revoke.addEventListener('click', async () => {
    revoke.disabled = true;
    try { await api('/credentials/gemini', { method:'DELETE' }); await refresh(host); }
    catch (error) { revoke.textContent = error.message; revoke.disabled = false; }
  });
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
