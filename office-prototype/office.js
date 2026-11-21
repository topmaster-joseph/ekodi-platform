'use strict';
// The prototype intentionally reads no credentials, files or tenant data.
(function () {
  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
  const allowed = new Set(['personal', 'team', 'desktop']);
  function select(name, focus) {
    if (!allowed.has(name)) return;
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.hidden = !active;
      if (active && focus) tab.focus();
    }
  }
  function navigate(name) {
    select(name, true);
    window.history.replaceState(null, '', '#'+name);
  }
  for (const tab of tabs) {
    tab.addEventListener('click', function () { navigate(tab.dataset.tab); });
    tab.addEventListener('keydown', function (event) {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      navigate(next.dataset.tab);
    });
  }
  window.addEventListener('hashchange', function () {
    const name = window.location.hash.slice(1);
    if (allowed.has(name)) select(name, false);
  });
  const initial = window.location.hash.slice(1);
  if (allowed.has(initial)) select(initial, false);

  // Workflow Desk provides only local, readable handoff templates. It never
  // handles account credentials, creates approvals or submits organization data.
  const flows = Array.from(document.querySelectorAll('[role="tab"][data-flow]'));
  const flowNames = new Set(['meeting', 'proposal', 'education']);
  const feedback = document.getElementById('flow-copy-status');
  function activateFlow(name, focus) {
    if (!flowNames.has(name)) return;
    for (const tab of flows) {
      const active = tab.dataset.flow === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById('flow-panel-' + tab.dataset.flow);
      if (panel) panel.hidden = !active;
      if (focus && active) tab.focus();
    }
    if (feedback) feedback.textContent = '인계 서식은 화면에만 표시됩니다. 복사 전에는 외부로 전송하지 않습니다.';
  }
  for (const tab of flows) {
    tab.addEventListener('click', function () {
      activateFlow(tab.dataset.flow, false);
    });
    tab.addEventListener('keydown', function (event) {
      const index = flows.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = flows[(index + 1) % flows.length];
      if (event.key === 'ArrowLeft') next = flows[(index + flows.length - 1) % flows.length];
      if (event.key === 'Home') next = flows[0];
      if (event.key === 'End') next = flows[flows.length - 1];
      if (!next) return;
      event.preventDefault();
      activateFlow(next.dataset.flow, true);
    });
  }
  for (const button of document.querySelectorAll('[data-flow-copy]')) {
    button.addEventListener('click', async function () {
      const name = button.dataset.flowCopy;
      if (!flowNames.has(name)) return;
      const panel = document.getElementById('flow-panel-' + name);
      const template = panel?.querySelector('[data-flow-template="' + name + '"]');
      if (!template || panel.hidden) return;
      const content = template.textContent.trim();
      if (!content) return;
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        if (feedback) feedback.textContent = '자동 복사를 사용할 수 없는 브라우저입니다. 위 서식을 직접 선택해 복사하세요.';
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        if (feedback) feedback.textContent = '표준 인계 서식을 복사했습니다. 문서 작업실에 붙여넣고 실제 내용을 작성해 주세요.';
      } catch {
        if (feedback) feedback.textContent = '복사 권한이 허용되지 않았습니다. 위 서식을 직접 선택해 복사하세요.';
      }
    });
  }
}());