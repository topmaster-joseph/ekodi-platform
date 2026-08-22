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
  const list = hostSection.querySelector('#platformList');
  if (list) list.before(host);
  else hostSection.append(host);
  return host;
}

function planLabel(subscription) {
  const plan = String(subscription?.planId || 'free').trim().toUpperCase();
  return plan || 'FREE';
}

function renderGuest() {
  const host = ensureHost();
  if (!host) return;
  host.innerHTML = `
    <div class="membership-summary-head">
      <div><small>EKODI UNIVERSAL MEMBERSHIP</small><strong>Google 인증 하나로 전체 FREE 이용</strong></div>
      <span class="membership-badge">Guest</span>
    </div>
    <p>로그인하면 모든 EKODI 사용자 서비스의 기본 FREE 이용권과 서비스별 구독 상태를 한곳에서 확인합니다.</p>`;
}

function renderPortfolio(data) {
  const host = ensureHost();
  if (!host) return;
  const rows = Array.isArray(data?.services) ? data.services : USER_SERVICES.map((service) => ({
    ...service,
    subscription: { planId: 'free', status: 'eligible', inherited: true },
  }));
  const paid = rows.filter((row) => Number(row?.subscription?.monthlyFee || 0) > 0 || !['free', 'eligible'].includes(String(row?.subscription?.status || '').toLowerCase()) && String(row?.subscription?.planId || 'free').toLowerCase() !== 'free').length;
  host.innerHTML = `
    <div class="membership-summary-head">
      <div><small>EKODI UNIVERSAL MEMBERSHIP</small><strong>통합계정 · ${rows.length}개 서비스 FREE 기본 이용</strong></div>
      <span class="membership-badge">${paid ? `${paid} Paid` : 'FREE'}</span>
    </div>
    <p>계정은 하나, 기본 이용권은 전체 서비스에 적용됩니다. 유료 기능은 필요한 서비스만 개별적으로 업그레이드합니다.</p>
    <details class="membership-details">
      <summary>전체 서비스 이용권 보기</summary>
      <div class="membership-grid">
        ${rows.map((row) => `<a class="membership-service" href="https://${esc(row.domain)}"><span>${esc(row.name)}</span><b>${esc(planLabel(row.subscription))}</b></a>`).join('')}
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
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) throw new Error(`membership_portfolio_${response.status}`);
    renderPortfolio(await response.json());
  } catch (error) {
    console.warn('universal membership portfolio', error);
    renderPortfolio({
      services: USER_SERVICES.map((service) => ({
        ...service,
        subscription: { planId: 'free', status: 'eligible', inherited: true },
      })),
    });
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
