import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { USER_SERVICES } from './user-services.js';

const cfg = window.EKODI_MY_CONFIG || {};
const enabled = Boolean(cfg.dataEnabled && cfg.supabaseUrl && cfg.supabasePublishableKey);
const hostSection = document.querySelector('#platforms');
const ENTITLEMENT_SUBJECT_KEY = 'ekodi_my_entitlement_subject';
let entitlementSession = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function ensureHost() {
  let host = document.querySelector('#universalMembership');
  if (host || !hostSection) return host;
  host = document.createElement('div');
  host.id = 'universalMembership';
  host.className = 'membership-summary';
  host.setAttribute('aria-live', 'polite');
  const list = hostSection.querySelector('#platformList');
  if (list) list.before(host);
  else hostSection.append(host);
  return host;
}

function planLabel(subscription) {
  const plan = String(subscription?.planId || 'free').trim().toUpperCase();
  return plan || 'FREE';
}

function membershipState(subscription = {}) {
  const status = String(subscription?.status || 'eligible').trim().toLowerCase();
  const planId = String(subscription?.planId || 'free').trim().toLowerCase();
  const monthlyFee = Number(subscription?.monthlyFee || 0);
  const inheritedEligibility = status === 'eligible' && subscription?.inherited !== false;
  const paidPlan = planId !== 'free' || monthlyFee > 0;

  if (inheritedEligibility) return { label: '이용 가능', className: 'eligible', paid: false, active: false };
  if (paidPlan) {
    if (['canceled', 'cancelled', 'expired', 'ended'].includes(status)) {
      return { label: '종료', className: 'inactive', paid: false, active: false };
    }
    if (['past_due', 'failed', 'suspended', 'paused'].includes(status)) {
      return { label: '확인 필요', className: 'attention', paid: true, active: true };
    }
    return { label: '구독 중', className: 'paid', paid: true, active: true };
  }
  return { label: '사용 중', className: 'active', paid: false, active: true };
}

function portfolioRows(data) {
  const remote = Array.isArray(data?.services) ? data.services : [];
  const byId = new Map(remote.map((row) => [String(row?.id || ''), row]));
  return USER_SERVICES.map((service) => ({
    ...service,
    subscription: byId.get(service.id)?.subscription || { planId: 'free', status: 'eligible', inherited: true, monthlyFee: 0 },
  }));
}

function serviceMarkup(row) {
  const plan = esc(planLabel(row.subscription));
  const name = esc(row.name);
  if (row.available === false) {
    const state = row.status === 'planned' ? '예정' : '준비중';
    return `<span class="membership-service membership-service-disabled" aria-disabled="true"><span>${name}</span><span class="membership-service-meta"><b>${plan}</b><small class="membership-service-state membership-service-state-inactive">${state}</small></span></span>`;
  }
  const state = membershipState(row.subscription);
  return `<a class="membership-service" href="https://${esc(row.domain)}" aria-label="${name} ${plan} ${esc(state.label)}"><span>${name}</span><span class="membership-service-meta"><b>${plan}</b><small class="membership-service-state membership-service-state-${esc(state.className)}">${esc(state.label)}</small></span></a>`;
}

function renderGuest() {
  const host = ensureHost();
  if (!host) return;
  host.classList.remove('membership-summary-is-degraded');
  host.innerHTML = `
    <div class="membership-summary-head">
      <div><small>EKODI UNIVERSAL MEMBERSHIP</small><strong>Google 인증 하나로 전체 FREE 기본 자격</strong></div>
      <span class="membership-badge">Guest</span>
    </div>
    <p>로그인하면 운영 중인 EKODI 사용자 서비스를 FREE 수준부터 이용하고 서비스별 구독 상태를 한곳에서 확인합니다.</p>
    <div id="aiEntitlementManager" class="ai-entitlement-manager"><p class="ai-entitlement-empty">AI 고급기능 이용권은 로그인 후 개인·기관·단체별로 확인합니다.</p></div>`;
}

function renderPortfolio(data, { degraded = false } = {}) {
  const host = ensureHost();
  if (!host) return;
  const rows = portfolioRows(data);
  const availableRows = rows.filter((row) => row.available !== false);
  const states = availableRows.map((row) => membershipState(row.subscription));
  const paid = states.filter((state) => state.paid).length;
  const active = states.filter((state) => state.active).length;
  const badge = degraded ? '상태 확인 지연' : paid ? `${paid} Paid` : active ? `${active} 사용 중` : 'FREE 자격';
  host.classList.toggle('membership-summary-is-degraded', degraded);
  host.innerHTML = `
    <div class="membership-summary-head">
      <div><small>EKODI UNIVERSAL MEMBERSHIP</small><strong>통합계정 · 운영 ${availableRows.length}개 서비스 FREE 기본 자격</strong></div>
      <span class="membership-badge">${badge}</span>
    </div>
    <p>계정은 하나, 운영 중인 서비스의 FREE 이용 자격은 자동으로 제공됩니다. 실제 서비스 이용은 처음 사용할 때 활성화되고, 유료 기능은 필요한 서비스만 개별적으로 업그레이드합니다.</p>
    ${degraded ? '<p class="membership-summary-warning" role="status"><strong>상태 확인 지연</strong> 현재 구독 상태를 불러오지 못해 FREE 이용 자격만 표시합니다. 유료·활성화 상태는 연결 복구 후 자동 갱신됩니다.</p>' : ''}
    <details class="membership-details">
      <summary>전체 서비스 이용권 보기</summary>
      <div class="membership-grid">
        ${rows.map(serviceMarkup).join('')}
      </div>
    </details>
    <div id="aiEntitlementManager" class="ai-entitlement-manager"><p class="ai-entitlement-empty">AI 기능 이용권을 확인하고 있습니다.</p></div>`;
}

function storedEntitlementSubject() {
  try { return localStorage.getItem(ENTITLEMENT_SUBJECT_KEY) || 'person'; } catch { return 'person'; }
}
function rememberEntitlementSubject(value) {
  try { if (value) localStorage.setItem(ENTITLEMENT_SUBJECT_KEY, value); } catch {}
}
function entitlementLevelClass(level) {
  return ['basic','additional','advanced','automation'].includes(String(level || '')) ? String(level) : 'basic';
}
function entitlementSourceLabel(value) {
  return ({
    'universal-free':'공통 기본',
    'authenticated-member':'로그인 회원',
    'service-subscription':'서비스 구독',
    'service-preview':'연동 준비',
  })[String(value || '')] || '서비스 기준';
}
function entitlementCapabilityMarkup(item) {
  const level = entitlementLevelClass(item?.access?.level);
  const state = item?.usableNow ? esc(item?.access?.label || '기본') : '준비중';
  const source = item?.sourceKind === 'specialist' ? '전문서비스' : '공통기능';
  return `<article class="ai-entitlement-capability${item?.usableNow ? '' : ' is-preview'}">
    <div><strong>${esc(item?.name || 'AI 기능')}</strong><small>${esc(item?.categoryLabel || '')} · ${esc(source)}</small></div>
    <span class="ai-entitlement-level level-${esc(level)}">${esc(state)}</span>
    <small class="ai-entitlement-source">${esc(entitlementSourceLabel(item?.access?.source))}</small>
  </article>`;
}
function renderEntitlementManager(data, { degraded = false } = {}) {
  const host = document.querySelector('#aiEntitlementManager');
  if (!host) return;
  if (!data || !Array.isArray(data.capabilities)) {
    host.innerHTML = `<p class="ai-entitlement-empty">${degraded ? 'AI 이용권 상태 확인이 지연되고 있습니다.' : 'AI 이용권을 불러오지 못했습니다.'}</p>`;
    return;
  }
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const selected = data.subject || subjects[0] || { id:'person', name:'개인', type:'person', role:'owner', canManage:true };
  rememberEntitlementSubject(selected.id || 'person');
  const ready = data.capabilities.filter((item) => item.usableNow);
  const preview = data.capabilities.filter((item) => !item.usableNow);
  const levelCounts = ready.reduce((acc, item) => {
    const level = entitlementLevelClass(item?.access?.level);
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});
  const options = subjects.map((subject) => `<option value="${esc(subject.id)}"${subject.id === selected.id ? ' selected' : ''}>${esc(subject.name)} · ${subject.type === 'person' ? '개인' : '기관·단체'}</option>`).join('');
  const management = selected.canManage
    ? '이 주체의 구독·추가기능 변경 권한이 있습니다.'
    : '이 주체의 기능은 사용할 수 있지만 구독 변경은 권한 있는 담당자가 관리합니다.';
  host.innerHTML = `
    <div class="ai-entitlement-head">
      <div><small>EKODI AI ENTITLEMENT</small><strong>AI 기능 이용권 · 개인과 기관을 구분해 한곳에서 관리</strong></div>
      <a href="https://ekodi.kr/ai/">모두의 AI →</a>
    </div>
    <div class="ai-entitlement-subject-row">
      <label for="aiEntitlementSubject">이용 주체</label>
      <select id="aiEntitlementSubject">${options}</select>
      <span>${esc(selected.role || 'member')}</span>
    </div>
    <p class="ai-entitlement-rule">같은 주체가 같은 AI 기능을 모두의 AI와 전문·개별 사이트에서 사용하면 이용권을 공유합니다. 사이트 고유 추가기능은 해당 사이트 범위로만 관리합니다.</p>
    <div class="ai-entitlement-counts">
      <span>기본 ${Number(levelCounts.basic || 0)}</span>
      <span>추가 ${Number(levelCounts.additional || 0)}</span>
      <span>고급 ${Number(levelCounts.advanced || 0)}</span>
      <span>자동화 ${Number(levelCounts.automation || 0)}</span>
    </div>
    <p class="ai-entitlement-management">${esc(management)}</p>
    <details class="ai-entitlement-details">
      <summary>사용 가능한 AI 기능 보기 · ${ready.length}개</summary>
      <div class="ai-entitlement-grid">${ready.map(entitlementCapabilityMarkup).join('')}</div>
    </details>
    ${preview.length ? `<details class="ai-entitlement-details preview-details"><summary>연동 준비 기능 · ${preview.length}개</summary><div class="ai-entitlement-grid">${preview.map(entitlementCapabilityMarkup).join('')}</div></details>` : ''}
    ${degraded ? '<p class="membership-summary-warning"><strong>상태 확인 지연</strong> 일부 구독 상태가 최신이 아닐 수 있습니다.</p>' : ''}`;
  const select = host.querySelector('#aiEntitlementSubject');
  if (select) select.addEventListener('change', () => {
    rememberEntitlementSubject(select.value);
    void loadEntitlements(entitlementSession, select.value);
  });
}

async function loadEntitlements(session, subject = storedEntitlementSubject()) {
  entitlementSession = session || null;
  if (!session?.access_token) {
    renderEntitlementManager(null);
    return;
  }
  try {
    const url = new URL('https://ekodi.kr/api/membership/entitlements');
    if (subject) url.searchParams.set('subject', subject);
    const response = await fetch(url, {
      cache:'no-store',
      headers:{ authorization:`Bearer ${session.access_token}` },
    });
    if (response.status === 401) return renderEntitlementManager(null);
    if (!response.ok) throw new Error(`ai_entitlements_${response.status}`);
    renderEntitlementManager(await response.json());
  } catch (error) {
    console.warn('AI entitlement portfolio', error);
    renderEntitlementManager(null, { degraded:true });
  }
}

async function loadPortfolio(session) {
  if (!session?.access_token) {
    renderGuest();
    return;
  }
  try {
    const response = await fetch('https://ekodi.kr/api/membership/portfolio', {
      cache: 'no-store',
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (response.status === 401) {
      renderGuest();
      return;
    }
    if (!response.ok) throw new Error(`membership_portfolio_${response.status}`);
    renderPortfolio(await response.json());
    await loadEntitlements(session);
  } catch (error) {
    console.warn('universal membership portfolio', error);
    renderPortfolio(null, { degraded: true });
    await loadEntitlements(session);
  }
}

if (!enabled) {
  renderGuest();
} else {
  const sb = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { detectSessionInUrl: false, persistSession: true },
  });
  const { data } = await sb.auth.getSession();
  await loadPortfolio(data.session);
  sb.auth.onAuthStateChange((_event, session) => { void loadPortfolio(session); });
}
