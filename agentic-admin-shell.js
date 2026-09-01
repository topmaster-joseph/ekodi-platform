(() => {
  'use strict';
  if (window.EKODIAgenticAdmin) return;

  const STATE = { attention: 0, approvals: 0, completed: 0, failed: 0, last: [] };
  const MAX_RECENT = 5;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function style() {
    if (document.querySelector('#ekodi-agentic-admin-style')) return;
    const node = document.createElement('style');
    node.id = 'ekodi-agentic-admin-style';
    node.textContent = `
      .ekodi-agentic-home{margin:0 0 14px;padding:16px;border:1px solid #dbe5ec;border-radius:14px;background:#fff;color:#183247}
      .ekodi-agentic-command{display:flex;gap:8px;align-items:center}.ekodi-agentic-command input{flex:1;min-width:0;min-height:42px;padding:0 13px;border:1px solid #bdccd7;border-radius:10px;background:#fff;color:#183247;font:inherit;font-size:14px}.ekodi-agentic-command button{min-height:42px;padding:0 14px;border:1px solid #0b79a8;border-radius:10px;background:#0b79a8;color:#fff;font:inherit;font-weight:760;cursor:pointer}
      .ekodi-agentic-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.ekodi-agentic-kpi{padding:10px 11px;border:1px solid #e2e8ee;border-radius:10px;background:#f8fafc}.ekodi-agentic-kpi small{display:block;color:#617587;font-size:11px}.ekodi-agentic-kpi strong{display:block;margin-top:3px;color:#183247;font-size:22px}
      .ekodi-agentic-note{margin-top:10px;color:#5d7182;font-size:12px;line-height:1.5}.ekodi-agentic-recent{margin-top:10px;padding-top:10px;border-top:1px solid #e7edf2}.ekodi-agentic-recent strong{font-size:13px}.ekodi-agentic-recent ul{margin:7px 0 0;padding-left:18px;color:#506476;font-size:12px;line-height:1.55}
      @media(max-width:760px){.ekodi-agentic-command{align-items:stretch;flex-direction:column}.ekodi-agentic-command button{width:100%}.ekodi-agentic-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.append(node);
  }

  function markup() {
    const recent = STATE.last.length
      ? `<div class="ekodi-agentic-recent"><strong>최근 Operation</strong><ul>${STATE.last.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`
      : '';
    return `<form class="ekodi-agentic-command" data-agentic-command><input name="intent" autocomplete="off" aria-label="관리자 AI 명령" placeholder="무엇을 하시겠습니까? 예: 전체 시스템에서 문제 있는 것만 확인해"><button type="submit">AI에게 요청</button></form>
      <div class="ekodi-agentic-summary"><div class="ekodi-agentic-kpi"><small>확인 필요</small><strong>${STATE.attention}</strong></div><div class="ekodi-agentic-kpi"><small>승인 대기</small><strong>${STATE.approvals}</strong></div><div class="ekodi-agentic-kpi"><small>검증 완료</small><strong>${STATE.completed}</strong></div><div class="ekodi-agentic-kpi"><small>실패</small><strong>${STATE.failed}</strong></div></div>
      <div class="ekodi-agentic-note">운영 원칙: AI가 계획하고 정책이 허가하며, 실행 결과는 Evidence가 확인된 뒤에만 완료로 표시합니다.</div>${recent}`;
  }

  function target() {
    return document.querySelector('#app main') || document.querySelector('main') || document.querySelector('.content');
  }

  function mount() {
    style();
    const host = target();
    if (!host || document.querySelector('#ekodiAgenticHome')) return;
    const box = document.createElement('section');
    box.id = 'ekodiAgenticHome';
    box.className = 'ekodi-agentic-home';
    box.setAttribute('aria-label', 'EKODI Agentic Inbox');
    box.innerHTML = markup();
    const anchor = host.querySelector(':scope>.admin-context-tabs-shell') || host.querySelector(':scope>.topbar');
    if (anchor) anchor.insertAdjacentElement('afterend', box); else host.prepend(box);
    bind(box);
  }

  function refresh() {
    const box = document.querySelector('#ekodiAgenticHome');
    if (!box) return mount();
    box.innerHTML = markup();
    bind(box);
  }

  function openAssist(intent) {
    const bootstrap = document.querySelector('#ekodiAssistBootstrap');
    const launcher = document.querySelector('#ekodiAssistLauncher');
    (launcher || bootstrap)?.click();
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const textarea = document.querySelector('#ekodiAssistAi textarea');
      if (textarea) {
        window.clearInterval(timer);
        textarea.value = intent;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      } else if (tries > 30) window.clearInterval(timer);
    }, 100);
  }

  function bind(root) {
    root.querySelector('[data-agentic-command]')?.addEventListener('submit', event => {
      event.preventDefault();
      const intent = String(new FormData(event.currentTarget).get('intent') || '').trim();
      if (!intent) return;
      openAssist(intent);
    });
  }

  function updateOperation(detail = {}) {
    if (detail.counts) Object.assign(STATE, detail.counts);
    if (detail.summary) STATE.last = [String(detail.summary), ...STATE.last].slice(0, MAX_RECENT);
    refresh();
  }

  window.addEventListener('ekodi-operation-updated', event => updateOperation(event.detail));
  window.addEventListener('ekodi-admin-ready', mount);
  window.addEventListener('ekodi-authenticated', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();

  window.EKODIAgenticAdmin = Object.freeze({ mount, refresh, updateOperation, state: () => ({ ...STATE, last: [...STATE.last] }) });
})();
