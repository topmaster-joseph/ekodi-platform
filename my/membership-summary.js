import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { USER_SERVICES } from './user-services.js';

const cfg = window.EKODI_MY_CONFIG || {};
const enabled = Boolean(cfg.dataEnabled && cfg.supabaseUrl && cfg.supabasePublishableKey);
const hostSection = document.querySelector('#platforms');

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
    <p>로그인하면 운영 중인 EKODI 사용자 서비스를 FREE 수준부터 이용하고 서비스별 구독 상태를 한곳에서 확인합니다.</p>`;
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
    </details>`;
}

async function loadPortfolio(session) {
  if (!session?.access_token) {
    renderGuest();
    return;
  }
  try {
    const response = await fetch('https://api.ekodi.kr/api/membership/portfolio', {
      cache: 'no-store',
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (response.status === 401) {
      renderGuest();
      return;
    }
    if (!response.ok) throw new Error(`membership_portfolio_${response.status}`);
    renderPortfolio(await response.json());
  } catch (error) {
    console.warn('universal membership portfolio', error);
    renderPortfolio(null, { degraded: true });
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
