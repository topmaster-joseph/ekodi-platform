(() => {
  'use strict';

  const SECTION = 'ai-module-spec';
  const HASH = '#ai-module-spec';
  const CONTRACT_VERSION = '1.0.0';
  const SPEC_URL = 'https://github.com/topmaster-joseph/ekodi-platform/blob/main/docs/EKODI-EXTERNAL-AI-MODULE-SPEC.md';
  const CONTRACT_URL = 'https://github.com/topmaster-joseph/ekodi-platform/blob/main/config/external-ai-module-contract.json';
  const API_BASE = 'https://api.ekodi.kr/api/ai-modules/v1';

  const manifestExample = {
    id: 'vendor.marketing-ai',
    name: 'Vendor Marketing AI',
    version: '1.0.0',
    endpoint: 'https://vendor.example.com',
    capabilities: ['marketing.campaign', 'marketing.content', 'marketing.analysis'],
    secretBinding: 'VENDOR_MARKETING_AI_SECRET',
    timeoutMs: 12000,
    enabled: true,
  };

  const requestExample = {
    contractVersion: '1.0.0',
    requestId: 'uuid',
    moduleId: 'vendor.marketing-ai',
    capability: 'marketing.campaign',
    context: {
      spaceId: 'jadam',
      serviceId: 'marketing',
      actorId: 'ekodi-user-or-agent-id',
      role: 'owner',
      capabilities: ['marketing.campaign'],
      attestedBy: 'ekodi:marketing-service',
    },
    input: { storeId: 'mokpo-univ', goal: 'increase repeat visits' },
  };

  const responseExample = {
    contractVersion: '1.0.0',
    requestId: 'same-uuid',
    ok: true,
    output: { campaign: '...' },
    usage: { units: 1 },
    meta: { model: 'vendor-model-name' },
  };

  const acceptance = [
    ['HTTPS', 'GET /v1/health와 POST /v1/execute를 HTTPS로 구현'],
    ['계약', 'contractVersion과 requestId를 정확히 되돌려줌'],
    ['권한', 'EKODI가 보낸 capability 범위 밖의 권한을 요구하지 않음'],
    ['격리', 'Google Drive, D1/Supabase, R2 관리자 자격증명을 요구하지 않음'],
    ['오류', '구조화된 error envelope를 반환하고 timeout 테스트를 통과'],
    ['저장', '영구 결과는 외부업체가 아니라 EKODI Storage Gateway가 저장'],
    ['교체성', '업체 교체 시 EKODI 원본 데이터 이전이 필요하지 않음'],
  ];

  function locale() {
    try {
      const value = window.EKODIAdminSidebar?.locale?.() || window.EKODIAdminMenu?.locale?.() || localStorage.getItem('ekodi-admin-locale') || document.documentElement.lang || navigator.language || 'ko';
      return String(value).toLowerCase().startsWith('en') ? 'en' : 'ko';
    } catch { return 'ko'; }
  }
  function t(ko, en) { return locale() === 'en' ? en : ko; }
  function el(tag, text = '', className = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function pretty(value) { return JSON.stringify(value, null, 2); }
  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = t('복사됨 ✓', 'Copied ✓');
      window.setTimeout(() => { button.textContent = previous; }, 1400);
    } catch {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
  }
  function copyButton(labelKo, labelEn, text) {
    const button = el('button', t(labelKo, labelEn), 'ai-spec-button secondary');
    button.type = 'button';
    button.addEventListener('click', () => copyText(text, button));
    return button;
  }
  function codeCard(titleKo, titleEn, value) {
    const card = el('article', '', 'ai-spec-card ai-spec-code-card');
    const head = el('div', '', 'ai-spec-card-head');
    head.append(el('h3', t(titleKo, titleEn)), copyButton('예제 복사', 'Copy example', pretty(value)));
    const pre = el('pre'); const code = el('code', pretty(value)); pre.append(code); card.append(head, pre); return card;
  }
  function flowCard(step, titleKo, titleEn, copyKo, copyEn) {
    const card = el('article', '', 'ai-spec-flow-card');
    card.append(el('span', String(step), 'ai-spec-step'), el('strong', t(titleKo, titleEn)), el('p', t(copyKo, copyEn)));
    return card;
  }
  function vendorPackage() {
    return `EKODI External AI Module Integration v${CONTRACT_VERSION}\n\n` +
      `목적: 외부 전문 AI를 EKODI에 교체 가능한 모듈로 연결합니다.\n` +
      `공식 규격: ${SPEC_URL}\n` +
      `기계판독 계약: ${CONTRACT_URL}\n\n` +
      `업체가 구현할 엔드포인트\n- GET /v1/health\n- POST /v1/execute\n\n` +
      `핵심 원칙\n- HTTPS 필수\n- EKODI 사용자인증, Space, Role, Capability는 EKODI가 결정\n- 업체는 Google Drive, D1/Supabase, R2 관리자 자격증명을 받지 않음\n- 업체는 결과를 EKODI로 반환하고, 영구 보존은 EKODI Storage Gateway가 담당\n- 서비스는 업체명이 아니라 capability에 의존하므로 업체를 교체할 수 있어야 함\n\n` +
      `Manifest 예제\n${pretty(manifestExample)}\n\n` +
      `요청 예제\n${pretty(requestExample)}\n\n` +
      `응답 예제\n${pretty(responseExample)}\n\n` +
      `검수 기준\n${acceptance.map(([name, item]) => `- ${name}: ${item}`).join('\n')}\n`;
  }
  function render() {
    const section = document.querySelector('#aiModuleSpecPanel');
    if (!section) return;
    section.replaceChildren();

    const hero = el('div', '', 'ai-spec-hero');
    const heroCopy = el('div');
    heroCopy.append(
      el('div', 'EKODI EXTERNAL AI MODULE CONTRACT', 'ai-spec-kicker'),
      el('h2', t('외부 AI 연동규격', 'External AI Integration Spec')),
      el('p', t('외부 개발사에 그대로 전달할 수 있는 EKODI 표준 계약입니다. 업체는 전문 AI 엔진만 구현하고, 인증·권한·저장·감사는 EKODI가 소유합니다.', 'The standard EKODI contract you can hand directly to an external AI vendor. The vendor implements only the specialist engine; EKODI owns identity, authorization, storage and audit.'), 'ai-spec-lead')
    );
    const heroActions = el('div', '', 'ai-spec-actions');
    const packageButton = copyButton('협력사 전달문 복사', 'Copy vendor handoff', vendorPackage()); packageButton.classList.add('primary');
    const specLink = el('a', t('공식 규격 원문', 'Official specification'), 'ai-spec-button'); specLink.href = SPEC_URL; specLink.target = '_blank'; specLink.rel = 'noopener noreferrer';
    const contractLink = el('a', t('JSON 계약 보기', 'View JSON contract'), 'ai-spec-button'); contractLink.href = CONTRACT_URL; contractLink.target = '_blank'; contractLink.rel = 'noopener noreferrer';
    heroActions.append(packageButton, specLink, contractLink); hero.append(heroCopy, heroActions); section.append(hero);

    const status = el('div', '', 'ai-spec-status-grid');
    const facts = [
      [t('계약 버전', 'Contract version'), `v${CONTRACT_VERSION}`],
      [t('업체 실행 규격', 'Vendor execution'), 'POST /v1/execute'],
      [t('영구 저장', 'Durable storage'), 'EKODI Storage Gateway'],
      [t('원본 저장소', 'Canonical store'), 'Shared Drive · EKODI'],
    ];
    for (const [label, value] of facts) { const card = el('div', '', 'ai-spec-fact'); card.append(el('span', label), el('strong', value)); status.append(card); }
    section.append(status);

    const flow = el('section', '', 'ai-spec-block'); flow.append(el('h3', t('연동 흐름', 'Integration flow')));
    const flowGrid = el('div', '', 'ai-spec-flow');
    flowGrid.append(
      flowCard(1, 'EKODI 인증', 'EKODI authenticates', '사용자·Space·Role·Capability를 EKODI가 확정합니다.', 'EKODI resolves user, Space, Role and Capability.'),
      flowCard(2, 'AI Gateway 호출', 'Gateway invocation', `${API_BASE}/execute를 등록된 내부 호출자가 호출합니다.`, 'A registered EKODI internal caller invokes the gateway.'),
      flowCard(3, '외부 AI 실행', 'Vendor execution', '업체는 /v1/execute 계약 안에서 전문 결과만 반환합니다.', 'The vendor returns specialist output only through /v1/execute.'),
      flowCard(4, 'EKODI 저장', 'EKODI persistence', '보존이 필요한 결과는 EKODI가 Shared Drive에 기록합니다.', 'EKODI persists retained output to the Shared Drive.')
    );
    flow.append(flowGrid); section.append(flow);

    const rules = el('section', '', 'ai-spec-block'); rules.append(el('h3', t('반드시 지켜야 할 경계', 'Non-negotiable boundaries')));
    const ruleGrid = el('div', '', 'ai-spec-rules');
    const ruleItems = [
      ['✓', t('허용', 'Allowed'), t('EKODI가 최소 context와 capability를 업체에 전달', 'EKODI sends minimum context and capability to the vendor')],
      ['×', t('금지', 'Forbidden'), t('외부 AI → Google Drive 직접 접근', 'External AI → direct Google Drive access')],
      ['×', t('금지', 'Forbidden'), t('외부 AI → D1/Supabase 직접 접근', 'External AI → direct D1/Supabase access')],
      ['×', t('금지', 'Forbidden'), t('외부 AI → R2 관리자 자격증명 수령', 'External AI → privileged R2 credentials')],
    ];
    for (const [mark, title, copy] of ruleItems) { const row = el('div', '', 'ai-spec-rule'); row.append(el('span', mark, 'ai-spec-rule-mark'), el('strong', title), el('span', copy)); ruleGrid.append(row); }
    rules.append(ruleGrid); section.append(rules);

    const examples = el('section', '', 'ai-spec-block'); examples.append(el('h3', t('개발사 전달 예제', 'Vendor implementation examples')));
    const exampleGrid = el('div', '', 'ai-spec-example-grid');
    exampleGrid.append(codeCard('Module Manifest', 'Module Manifest', manifestExample), codeCard('Execution Request', 'Execution Request', requestExample), codeCard('Execution Response', 'Execution Response', responseExample));
    examples.append(exampleGrid); section.append(examples);

    const checklist = el('section', '', 'ai-spec-block'); checklist.append(el('h3', t('업체 검수 체크리스트', 'Vendor acceptance checklist')));
    const list = el('div', '', 'ai-spec-checklist');
    for (const [name, item] of acceptance) { const row = el('label', '', 'ai-spec-check'); const box = document.createElement('input'); box.type = 'checkbox'; row.append(box, el('strong', name), el('span', item)); list.append(row); }
    checklist.append(list); section.append(checklist);

    const note = el('div', '', 'ai-spec-note');
    note.append(el('strong', t('운영 원칙', 'Operating rule')), el('span', t('외부업체가 바뀌어도 사용자 서비스와 원본 데이터는 EKODI에 남아야 합니다. 서비스는 vendor가 아니라 capability에 의존합니다.', 'User services and canonical data must remain in EKODI when a vendor changes. Services depend on capabilities, not vendor identity.')));
    section.append(note);
  }

  function activate(button, section) {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const visible = panel === section;
      panel.classList.toggle('hidden-panel', !visible);
      panel.hidden = !visible;
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.toggle('active', item === button));
    const title = document.querySelector('#pageTitle'); if (title) title.textContent = t('외부 AI 연동규격', 'External AI Integration Spec');
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== HASH) history.replaceState(null, '', HASH);
    render();
  }

  function install() {
    const nav = document.querySelector('.sidebar nav'); const content = document.querySelector('.content');
    if (!nav || !content) return;
    let button = nav.querySelector('[data-section="ai-module-spec"]');
    if (!button) {
      button = el('button', '', 'nav'); button.type = 'button'; button.dataset.section = SECTION;
      button.append(document.createTextNode('API '), el('span', t('외부 AI 연동규격', 'External AI Spec')));
      const aiops = nav.querySelector('[data-section="aiops"],[data-demand-feature="aiops"]');
      if (aiops) aiops.insertAdjacentElement('afterend', button); else nav.append(button);
    }
    let section = document.querySelector('#aiModuleSpecPanel');
    if (!section) { section = el('section', '', 'section ai-module-spec-admin hidden-panel'); section.dataset.panel = SECTION; section.id = 'aiModuleSpecPanel'; section.hidden = true; content.append(section); }
    if (button.dataset.aiSpecBound !== 'true') { button.dataset.aiSpecBound = 'true'; button.addEventListener('click', () => activate(button, section)); }
    window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail: { section: SECTION } }));
    if (location.hash === HASH) queueMicrotask(() => activate(button, section));
  }

  install();
  window.addEventListener('ekodi-admin-ready', install);
  window.addEventListener('ekodi-admin-locale-changed', () => { render(); window.EKODIAdminSidebar?.sync?.(); });
  window.EKODIAIModuleSpecAdmin = Object.freeze({ render, vendorPackage, version: CONTRACT_VERSION });
})();
