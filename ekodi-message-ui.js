(() => {
  'use strict';

  const STYLE_ID = 'ekodi-message-ui-style';
  const TYPE_META = Object.freeze({
    success: { label: '성공', icon: '✓', color: '#22A55B', bg: '#EAF8F0', role: 'status' },
    info: { label: '안내', icon: 'i', color: '#2878D4', bg: '#EAF3FF', role: 'status' },
    warning: { label: '주의', icon: '!', color: '#E69200', bg: '#FFF6DE', role: 'alert' },
    error: { label: '오류', icon: '×', color: '#D94646', bg: '#FFF0F0', role: 'alert' },
    permission: { label: '권한', icon: '⌁', color: '#8157C8', bg: '#F4EEFF', role: 'alert' },
    security: { label: '보안', icon: '◆', color: '#218C9D', bg: '#EAF8FA', role: 'alert' },
    system: { label: '시스템', icon: '●', color: '#4779BD', bg: '#EEF5FF', role: 'status' },
    waiting: { label: '대기', icon: '◷', color: '#D95779', bg: '#FFF0F5', role: 'status' },
  });

  const DEFAULT_COPY = Object.freeze({
    success: ['처리가 완료되었습니다.', '요청하신 작업이 정상적으로 완료되었습니다.'],
    info: ['확인해 주세요.', '아래 내용을 확인해 주세요.'],
    warning: ['주의가 필요합니다.', '입력하신 내용을 다시 확인해 주세요.'],
    error: ['처리에 실패했습니다.', '잠시 후 다시 시도해 주세요.'],
    permission: ['권한이 없습니다.', '접근 권한이 필요한 기능입니다.'],
    security: ['보안 인증이 필요합니다.', '계정 보호를 위해 다시 인증해 주세요.'],
    system: ['시스템을 점검하고 있습니다.', '더 나은 서비스를 위해 점검을 진행하고 있습니다.'],
    waiting: ['잠시만 기다려 주세요.', '요청하신 작업을 처리 중입니다.'],
  });

  const css = `
    .ekodi-message-ui{--ekodi-message-color:#2878D4;--ekodi-message-tint:#EAF3FF;display:grid;place-items:center;width:100%;min-height:240px;padding:clamp(28px,7vw,72px) clamp(18px,4vw,40px);color:var(--ekodi-message-text,#1E293B);font-family:system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;text-align:center}
    .ekodi-message-ui[data-layout="page"]{min-height:min(72vh,720px)}
    .ekodi-message-ui__card{width:min(100%,620px);padding:clamp(24px,5vw,44px);border:1px solid color-mix(in srgb,var(--ekodi-message-color) 15%,transparent);border-radius:24px;background:var(--ekodi-message-surface,#fff);box-shadow:0 18px 55px rgba(15,23,42,.08)}
    .ekodi-message-ui[data-chrome="plain"] .ekodi-message-ui__card{border:0;background:transparent;box-shadow:none}
    .ekodi-message-ui__type{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;color:var(--ekodi-message-color);font-size:13px;font-weight:820;letter-spacing:-.01em}
    .ekodi-message-ui__type-icon{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:999px;background:var(--ekodi-message-color);color:#fff;font-size:15px;font-weight:900;line-height:1}
    .ekodi-message-ui__visual{position:relative;width:min(52vw,210px);aspect-ratio:1/1;margin:0 auto 18px;display:grid;place-items:center;border-radius:48% 52% 52% 48%/52% 45% 55% 48%;background:radial-gradient(circle at 50% 38%,#fff 0 27%,var(--ekodi-message-tint) 28% 68%,transparent 69%)}
    .ekodi-message-ui__visual svg{width:86%;height:86%;overflow:visible}
    .ekodi-message-ui__title{margin:0;color:var(--ekodi-message-heading,#20252D);font-size:clamp(24px,4.5vw,34px);font-weight:850;line-height:1.25;letter-spacing:-.045em;word-break:keep-all}
    .ekodi-message-ui__description{margin:14px auto 0;max-width:470px;color:var(--ekodi-message-muted,#667085);font-size:clamp(14px,2.8vw,17px);line-height:1.65;letter-spacing:-.02em;word-break:keep-all}
    .ekodi-message-ui__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:25px}
    .ekodi-message-ui__button{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border:1px solid rgba(15,23,42,.12);border-radius:13px;background:#fff;color:#334155;font:inherit;font-size:14px;font-weight:780;text-decoration:none;cursor:pointer}
    .ekodi-message-ui__button[data-primary="true"]{border-color:var(--ekodi-message-color);background:var(--ekodi-message-color);color:#fff}
    .ekodi-message-ui__button:focus-visible{outline:3px solid color-mix(in srgb,var(--ekodi-message-color) 28%,transparent);outline-offset:3px}
    .ekodi-message-ui__details{margin:20px auto 0;max-width:500px;text-align:left}
    .ekodi-message-ui__details summary{cursor:pointer;color:var(--ekodi-message-muted,#667085);font-size:12px;font-weight:760;text-align:center}
    .ekodi-message-ui__details pre{overflow:auto;margin:10px 0 0;padding:13px 14px;border-radius:12px;background:rgba(15,23,42,.05);color:var(--ekodi-message-muted,#667085);font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
    .ekodi-message-ui__pulse{transform-origin:center;animation:ekodi-message-pulse 1.45s ease-in-out infinite}
    @keyframes ekodi-message-pulse{0%,100%{opacity:.45;transform:scale(.92)}50%{opacity:1;transform:scale(1.06)}}
    @media (prefers-reduced-motion:reduce){.ekodi-message-ui__pulse{animation:none}}
    @media (max-width:520px){.ekodi-message-ui{padding:28px 16px}.ekodi-message-ui__card{padding:26px 17px;border-radius:20px}.ekodi-message-ui__visual{width:170px}.ekodi-message-ui__actions{display:grid}.ekodi-message-ui__button{width:100%}}
    [data-ekodi-shell-surface="admin"] .ekodi-message-ui{--ekodi-message-text:var(--ekodi-ui-text,#F4F7FB);--ekodi-message-heading:var(--ekodi-ui-text,#F4F7FB);--ekodi-message-muted:var(--ekodi-ui-muted,#9FB1C3);--ekodi-message-surface:var(--ekodi-ui-surface,#0B1D2E)}
    [data-ekodi-shell-surface="admin"] .ekodi-message-ui__button:not([data-primary="true"]){background:var(--ekodi-ui-surface-raised,#10263A);border-color:var(--ekodi-ui-border,#24425E);color:var(--ekodi-ui-text,#F4F7FB)}
    [data-ekodi-shell-surface="admin"] .ekodi-message-ui__details pre{background:rgba(255,255,255,.06)}
  `;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeText(value) {
    return String(value ?? '');
  }

  function illustration(type) {
    const waiting = type === 'waiting';
    const symbol = TYPE_META[type]?.icon || 'i';
    return `
      <svg viewBox="0 0 220 220" aria-hidden="true" focusable="false">
        <path d="M77 66c7-20 20-31 36-31 18 0 31 12 36 31" fill="#171717"/>
        <ellipse cx="110" cy="79" rx="36" ry="31" fill="#F2C7A8" stroke="#171717" stroke-width="3"/>
        <path d="M76 72c5-31 18-42 35-42 16 0 31 9 36 38-9-4-16-12-20-22-9 17-25 25-51 26Z" fill="#111"/>
        <circle cx="97" cy="79" r="2.6" fill="#171717"/><circle cx="124" cy="79" r="2.6" fill="#171717"/>
        <path d="M102 94c6 ${type === 'success' ? '6 12 6 18 0' : type === 'info' ? '0 12 0 18 0' : '-6 12-6 18 0'}" fill="none" stroke="#171717" stroke-width="3" stroke-linecap="round"/>
        <path d="M72 118c9-13 24-20 38-20s29 7 38 20l12 66H60l12-66Z" fill="#fff" stroke="#171717" stroke-width="3" stroke-linejoin="round"/>
        <path d="M98 101l12 17 12-17M110 118v54" fill="none" stroke="#171717" stroke-width="3"/>
        <rect x="97" y="143" width="26" height="31" rx="3" fill="#fff" stroke="#171717" stroke-width="3"/>
        <path d="M75 128l-9 47M145 128l9 47" stroke="#171717" stroke-width="3" stroke-linecap="round"/>
        <g class="${waiting ? 'ekodi-message-ui__pulse' : ''}">
          <circle cx="164" cy="55" r="24" fill="var(--ekodi-message-tint)" stroke="var(--ekodi-message-color)" stroke-width="2"/>
          <text x="164" y="63" text-anchor="middle" font-size="25" font-weight="900" fill="var(--ekodi-message-color)" font-family="system-ui,sans-serif">${symbol}</text>
        </g>
      </svg>`;
  }

  function normalizeType(type) {
    return TYPE_META[type] ? type : 'info';
  }

  function makeAction(action, primary = false) {
    if (!action?.label) return null;
    const el = action.href ? document.createElement('a') : document.createElement('button');
    el.className = 'ekodi-message-ui__button';
    el.dataset.primary = String(primary);
    el.textContent = action.label;
    if (action.href) el.href = action.href;
    else el.type = 'button';
    if (typeof action.onClick === 'function') el.addEventListener('click', action.onClick);
    return el;
  }

  function render(target, options = {}) {
    installStyles();
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('EKODIMessage.render target not found');

    const type = normalizeType(options.type || host.dataset.ekodiMessage || 'info');
    const meta = TYPE_META[type];
    const copy = DEFAULT_COPY[type];
    const title = options.title || host.dataset.title || copy[0];
    const description = options.description ?? host.dataset.description ?? copy[1];
    const layout = options.layout || host.dataset.layout || 'card';
    const chrome = options.chrome || host.dataset.chrome || 'card';

    host.replaceChildren();
    host.classList.add('ekodi-message-ui');
    host.dataset.type = type;
    host.dataset.layout = layout;
    host.dataset.chrome = chrome;
    host.style.setProperty('--ekodi-message-color', meta.color);
    host.style.setProperty('--ekodi-message-tint', meta.bg);
    host.setAttribute('role', options.role || meta.role);
    host.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');

    const card = document.createElement('section');
    card.className = 'ekodi-message-ui__card';

    const typeLine = document.createElement('div');
    typeLine.className = 'ekodi-message-ui__type';
    const typeIcon = document.createElement('span');
    typeIcon.className = 'ekodi-message-ui__type-icon';
    typeIcon.setAttribute('aria-hidden', 'true');
    typeIcon.textContent = meta.icon;
    const typeText = document.createElement('span');
    typeText.textContent = options.label || meta.label;
    typeLine.append(typeIcon, typeText);

    const visual = document.createElement('div');
    visual.className = 'ekodi-message-ui__visual';
    visual.innerHTML = illustration(type);

    const heading = document.createElement(options.headingTag || 'h2');
    heading.className = 'ekodi-message-ui__title';
    heading.textContent = escapeText(title);

    card.append(typeLine, visual, heading);

    if (description) {
      const desc = document.createElement('p');
      desc.className = 'ekodi-message-ui__description';
      desc.textContent = escapeText(description);
      card.append(desc);
    }

    const actions = [options.primaryAction, options.secondaryAction].filter(Boolean);
    if (actions.length) {
      const actionRow = document.createElement('div');
      actionRow.className = 'ekodi-message-ui__actions';
      actions.forEach((action, index) => {
        const button = makeAction(action, index === 0);
        if (button) actionRow.append(button);
      });
      if (actionRow.childElementCount) card.append(actionRow);
    }

    if (options.details) {
      const details = document.createElement('details');
      details.className = 'ekodi-message-ui__details';
      const summary = document.createElement('summary');
      summary.textContent = options.detailsLabel || '자세히 보기';
      const pre = document.createElement('pre');
      pre.textContent = escapeText(options.details);
      details.append(summary, pre);
      card.append(details);
    }

    host.append(card);
    return host;
  }

  function show(options = {}) {
    const host = document.createElement('div');
    const parent = options.parent
      ? (typeof options.parent === 'string' ? document.querySelector(options.parent) : options.parent)
      : document.body;
    if (!parent) throw new Error('EKODIMessage.show parent not found');
    parent.append(host);
    render(host, options);
    return host;
  }

  function upgrade(root = document) {
    root.querySelectorAll('[data-ekodi-message]').forEach(node => {
      if (node.dataset.ekodiMessageReady === 'true') return;
      node.dataset.ekodiMessageReady = 'true';
      render(node);
    });
  }

  window.EKODIMessage = Object.freeze({
    types: Object.keys(TYPE_META),
    render,
    show,
    upgrade,
    defaults: DEFAULT_COPY,
  });

  installStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => upgrade(), { once: true });
  else upgrade();
})();
