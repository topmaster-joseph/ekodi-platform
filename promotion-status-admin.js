// EKODI 최고관리자 › AI 운영 › 검색노출·홍보 현황 (owner request 2026-11-03).
// One menu, four top tabs (3차 strip): 검색노출 · 홍보 자동게시 · 채널 연결 · 성장 종합.
// The two promotion tabs reuse the existing MarketingAI '게시 · 홍보' console and the
// external channel registry by adding alias tokens to their panels (same pattern as
// platform-overview → health), so no data path or permission changes.
// Each tab shows recommended commands the owner can paste into 「에코디와 대화하기」.
(() => {
  'use strict';
  if (window.EKODIPromotionStatus) return;

  const ALIASES = Object.freeze([
    { panel: '#marketingAiAdminPanel', section: 'promotion-autopost' },
    { panel: '#ekodiSocialAccountRegistry', section: 'promotion-channels' },
  ]);
  const PANEL_FOR = Object.freeze({
    'search-visibility': '#ekodiSearchVisibility',
    'promotion-autopost': '#marketingAiAdminPanel',
    'promotion-channels': '#ekodiSocialAccountRegistry',
    'growth-os': '[data-panel~="growth-os"]',
  });
  const PROMPTS = Object.freeze({
    'search-visibility': [
      '에코디, 검색노출·홍보 현황에서 [전체 사이트 기술점검]을 실행하고, 점검 실패 사이트와 미등록 검색엔진을 표로 정리한 뒤 자동으로 고칠 수 있는 것은 고치고, 내 승인이 필요한 것만 바로가기 링크와 함께 알려줘.',
      '에코디, 구글 서치콘솔·네이버 서치어드바이저·IndexNow 등록 상태를 사이트별로 확인하고, 아직 연결이 안 된 곳은 내가 눌러야 할 정확한 페이지 링크를 알려줘.',
    ],
    'promotion-autopost': [
      '에코디, 홍보 자동게시 현황을 점검해서 최근 7일 게시 건수·실패 건·승인 대기 건을 정리하고, 실패한 게시는 원인을 고쳐 다시 게시해줘. 유료 홍보와 광고비 지출은 내 승인 없이 진행하지 마.',
      '에코디, 에코디몰 상품 중에서 이번 주 홍보할 상품을 골라 무료 게시 계획을 세우고, 승인이 필요한 게시물만 목록으로 보여줘.',
    ],
    'promotion-channels': [
      '에코디, 홍보 채널(유튜브·페이스북·인스타그램·스레드·네이버) 연결 상태를 확인하고, 끊어졌거나 아직 연결되지 않은 채널은 내가 로그인해야 할 정확한 연결 페이지 링크를 알려줘.',
    ],
    'growth-os': [
      '에코디, 검색노출·홍보·판매 성과를 종합해서 이번 주 가장 중요한 성장 조치 3가지를 정하고, 자동으로 할 수 있는 것은 진행하고 결과를 보고해줘.',
    ],
  });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const content = () => document.querySelector('#app .content') || document.querySelector('.content');
  const currentSection = () => window.EKODIAdminRoutes?.sectionFromLocation?.(location) || window.EKODIAdminPanels?.current?.() || '';

  function ensureStyle() {
    if (document.getElementById('ekodiPromotionStatusStyle')) return;
    const style = document.createElement('style');
    style.id = 'ekodiPromotionStatusStyle';
    style.textContent = `
.ekodi-promo-prompts{margin:0 0 14px;padding:12px 14px;border:1px solid #cfe0f3;border-radius:12px;background:#f4f9ff;color:#172033}
.ekodi-promo-prompts[hidden]{display:none!important}
.ekodi-promo-prompts h3{margin:0 0 4px;font-size:14px}
.ekodi-promo-prompts p.ekodi-promo-guide{margin:0 0 8px;color:#4a5b70;font-size:12.5px;line-height:1.55}
.ekodi-promo-prompts ol{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.ekodi-promo-prompts li{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:9px 10px;border:1px solid #dbe6f2;border-radius:9px;background:#fff}
.ekodi-promo-prompts li span{flex:1;min-width:0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.ekodi-promo-prompts .ekodi-promo-actions{display:flex;gap:6px;flex-shrink:0}
.ekodi-promo-prompts button{min-height:30px;padding:4px 10px;border:1px solid #bcd3ec;border-radius:8px;background:#fff;color:#0b5cab;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.ekodi-promo-prompts button.primary{background:#0b5cab;border-color:#0b5cab;color:#fff}
.ekodi-promo-prompts small.ekodi-promo-state{display:block;min-height:16px;margin-top:6px;color:#2f5f86;font-size:12px}
@media(max-width:760px){.ekodi-promo-prompts li{flex-direction:column}.ekodi-promo-prompts .ekodi-promo-actions{align-self:flex-end}}`;
    document.head.append(style);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok;
    } catch { return false; }
  }

  // Opens 「에코디와 대화하기」 and puts the command in its input. It is not sent
  // automatically: the owner reviews it and presses 실행.
  function fillAssist(text) {
    try { window.EKODIAdminAssist?.open?.(); } catch {}
    const input = document.getElementById('ekodiAssistCommand');
    if (!input) return false;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    try { input.focus(); input.setSelectionRange(text.length, text.length); } catch {}
    return true;
  }

  function promptCard(section) {
    const card = document.createElement('section');
    card.className = 'ekodi-promo-prompts';
    card.dataset.promoPromptsFor = section;
    card.setAttribute('aria-label', '추천 지시문');
    card.innerHTML = `<h3>추천 지시문</h3>
      <p class="ekodi-promo-guide">아래 문장을 화면 아래 <b>「에코디와 대화하기」</b> 창에 넣고 실행하면, 에코디가 이 화면의 현황 확인과 다음 조치를 한 번에 진행합니다. <b>[대화창에 넣기]</b>를 누르면 바로 입력되고, 확인 후 <b>실행</b>을 누르시면 됩니다.</p>
      <ol>${PROMPTS[section].map((text, index) => `<li><span>${esc(text)}</span><div class="ekodi-promo-actions"><button type="button" class="primary" data-promo-fill="${index}">대화창에 넣기</button><button type="button" data-promo-copy="${index}">복사</button></div></li>`).join('')}</ol>
      <small class="ekodi-promo-state" role="status" aria-live="polite"></small>`;
    const state = card.querySelector('.ekodi-promo-state');
    card.addEventListener('click', async event => {
      const fill = event.target.closest?.('[data-promo-fill]');
      const copy = event.target.closest?.('[data-promo-copy]');
      if (!fill && !copy) return;
      const text = PROMPTS[section][Number((fill || copy).dataset.promoFill ?? (fill || copy).dataset.promoCopy)] || '';
      if (fill) {
        state.textContent = fillAssist(text) ? '「에코디와 대화하기」 창에 넣었습니다. 내용을 확인하고 실행을 누르세요.' : (await copyText(text) ? '대화창을 찾지 못해 복사했습니다. 「에코디와 대화하기」 창에 붙여넣어 주세요.' : '대화창을 열 수 없습니다. 문장을 직접 복사해 주세요.');
      } else {
        state.textContent = await copyText(text) ? '복사했습니다. 「에코디와 대화하기」 창에 붙여넣어 실행하세요.' : '복사하지 못했습니다. 문장을 직접 선택해 복사해 주세요.';
      }
    });
    return card;
  }

  function applyAliases() {
    let changed = false;
    for (const { panel: selector, section } of ALIASES) {
      const panel = document.querySelector(selector);
      if (!panel) continue;
      const tokens = String(panel.dataset.panel || '').split(/\s+/).filter(Boolean);
      if (!tokens.includes(section)) { panel.dataset.panel = [...tokens, section].join(' '); changed = true; }
    }
    return changed;
  }

  function ensureCards() {
    ensureStyle();
    for (const [section, selector] of Object.entries(PANEL_FOR)) {
      const panel = document.querySelector(selector);
      if (!panel) continue;
      // Panels such as Growth OS re-render their whole innerHTML; re-attach the card after each render.
      if (!watched.has(panel)) { watched.add(panel); new MutationObserver(reconcile).observe(panel, { childList: true }); }
      if (panel.querySelector(`:scope > [data-promo-prompts-for="${section}"]`)) continue;
      const card = promptCard(section);
      const anchor = panel.querySelector(':scope > header') || [...panel.children].find(node => node.tagName !== 'STYLE');
      if (anchor) anchor.after(card); else panel.prepend(card);
    }
    syncCards(currentSection());
  }

  // Shared panels (MarketingAI, channel registry) show the card only under this menu.
  function syncCards(section) {
    for (const card of document.querySelectorAll('[data-promo-prompts-for]')) card.hidden = card.dataset.promoPromptsFor !== section;
  }

  function openPromotionTab(section, attempt = 0) {
    if (section === 'promotion-autopost') {
      const tab = document.querySelector('#marketingAiAdminPanel [data-marketing-tab="channels"]');
      if (tab) { if (!tab.classList.contains('active')) tab.click(); return; }
    } else if (section === 'promotion-channels') {
      const refresh = document.querySelector('#ekodiSocialAccountRegistry [data-social-refresh]');
      if (refresh) { if (!refresh.disabled) refresh.click(); return; }
    } else return;
    if (attempt < 20) setTimeout(() => openPromotionTab(section, attempt + 1), 250);
  }

  const watched = new WeakSet();
  let scheduled = false;
  function reconcile() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (applyAliases()) window.dispatchEvent(new CustomEvent('ekodi-nav-changed', { detail: { feature: 'promotion-status' } }));
      ensureCards();
    }, 0);
  }

  function install() {
    const root = content();
    if (!root) return false;
    new MutationObserver(reconcile).observe(root, { childList: true });
    window.addEventListener('ekodi-admin-section-changed', event => {
      const section = String(event.detail?.section || '');
      applyAliases();
      ensureCards();
      syncCards(section);
      openPromotionTab(section);
    });
    reconcile();
    const initial = currentSection();
    if (initial === 'promotion-autopost' || initial === 'promotion-channels') setTimeout(() => openPromotionTab(initial), 300);
    return true;
  }

  window.EKODIPromotionStatus = Object.freeze({ version: '1.1.0', sections: Object.freeze(Object.keys(PANEL_FOR)), prompts: PROMPTS, fillAssist });
  if (!install()) {
    const retry = () => { if (install()) document.removeEventListener('DOMContentLoaded', retry); };
    document.addEventListener('DOMContentLoaded', retry);
  }
})();
