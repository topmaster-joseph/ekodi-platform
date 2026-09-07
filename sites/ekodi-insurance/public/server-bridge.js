(() => {
  const STAGING_API = 'https://ekodi-insurance-api-staging.ekodi-development.workers.dev';
  const GREEN_API = 'https://ekodi-insurance-api-green.topmaster-joseph.workers.dev';
  const PRODUCTION_API = 'https://insurance-api.ekodi.kr';
  const GREEN_HOST = 'ekodi-insurance-green.topmaster-joseph.workers.dev';
  const IS_PRODUCTION_UI = location.hostname === 'ins.ekodi.kr' || location.hostname === GREEN_HOST;
  const API = location.hostname === 'ins.ekodi.kr'
    ? PRODUCTION_API
    : location.hostname === GREEN_HOST
      ? GREEN_API
      : STAGING_API;
  const STATE_KEY = 'ekodi-insurance-staging-v3';
  const ACCESS_KEY = 'ekodi-insurance-consultation-access-v1';

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }
  function currentMessages() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return Array.isArray(state?.advisorChat?.messages) ? state.advisorChat.messages.slice(-20) : [];
    } catch { return []; }
  }
  function loadAccess() {
    try {
      const items = JSON.parse(localStorage.getItem(ACCESS_KEY) || '[]');
      return Array.isArray(items) ? items.filter(item => item?.id && item?.accessToken) : [];
    } catch { return []; }
  }
  function writeAccess(items) {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(items.slice(0, 20)));
    renderWithdrawalPanel();
  }
  function handoffForm(form) {
    return form instanceof HTMLFormElement && form.querySelector('[name="contact"]') && form.querySelector('[name="name"]');
  }
  function summaryCode(messages, topic = '') {
    const text = `${topic} ${messages.map(item => item?.text || item?.content || '').join(' ')}`;
    if (/청구|병원비|진료|입원|수술/.test(text)) return 'CLAIMS';
    if (/보험료|부담|해지|유지/.test(text)) return 'PREMIUM';
    if (/보장|중복|갱신|보험.*점검/.test(text)) return 'COVERAGE';
    if (/설계사|가입|상품/.test(text)) return 'PRODUCT_HANDOFF';
    return 'GENERAL';
  }
  function ensureConsentFields(form) {
    if (!handoffForm(form)) return;
    const submit = form.querySelector('button[type="submit"]');
    const boxes = [...form.querySelectorAll('.consent-box')];
    let contactBox = boxes.find(box => box.querySelector('[name="contactConsent"]')) || boxes[0];
    if (!contactBox) {
      contactBox = document.createElement('div');
      contactBox.className = 'consent-box';
      submit?.before(contactBox);
    }
    let contactInput = contactBox.querySelector('input[type="checkbox"]');
    if (!contactInput) {
      contactInput = document.createElement('input');
      contactInput.type = 'checkbox';
      contactBox.prepend(contactInput);
    }
    const contactId = contactInput.id || `${form.id || 'handoff'}ContactConsent`;
    contactInput.id = contactId;
    contactInput.name = 'contactConsent';
    contactInput.required = true;
    let contactLabel = contactBox.querySelector('label');
    if (!contactLabel) {
      contactLabel = document.createElement('label');
      contactBox.append(contactLabel);
    }
    contactLabel.htmlFor = contactId;
    contactLabel.innerHTML = '<strong>설계사 연락 요청을 위한 연락정보 처리 동의 (필수)</strong><span>이름과 연락처를 상담 연결 목적으로 암호화해 상담대기열에 저장하며, 상담요청 철회 또는 보유기간 만료 시 삭제합니다.</span>';

    let transcriptBox = form.querySelector('.transcript-consent');
    if (!transcriptBox) {
      transcriptBox = document.createElement('div');
      transcriptBox.className = 'consent-box transcript-consent';
      const transcriptId = `${form.id || 'handoff'}TranscriptConsent`;
      transcriptBox.innerHTML = `<input id="${transcriptId}" name="transcriptConsent" type="checkbox" /><label for="${transcriptId}"><strong>AI 상담 대화 공유 (선택)</strong><span>대화에는 건강·진료 등 민감정보가 포함될 수 있습니다. 선택하면 최근 AI 상담내용을 암호화해 담당자가 확인할 수 있으며, 선택하지 않아도 상담요청은 가능합니다.</span></label>`;
      submit?.before(transcriptBox);
    }
  }
  function formSnapshot(form) {
    ensureConsentFields(form);
    const data = Object.fromEntries(new FormData(form));
    const messages = currentMessages();
    const contactConsent = Boolean(form.querySelector('[name="contactConsent"]')?.checked);
    const transcriptConsent = Boolean(form.querySelector('[name="transcriptConsent"]')?.checked);
    const topic = String(data.topic || '').trim();
    return {
      name: String(data.name || '').trim(),
      contact: String(data.contact || '').trim(),
      preferredTime: String(data.preferredTime || data.time || '').trim(),
      summaryCode: summaryCode(messages, topic),
      shareConsent: contactConsent,
      shareTranscript: transcriptConsent,
      topic: transcriptConsent ? topic : '',
      messages: transcriptConsent ? messages : []
    };
  }
  function saveAccess(consultation, accessToken) {
    if (!consultation?.id || !accessToken) return;
    const items = loadAccess().filter(item => item.id !== consultation.id);
    items.unshift({ id: consultation.id, accessToken, status: consultation.status, createdAt: consultation.createdAt });
    writeAccess(items);
  }
  async function submitHandoff(payload, form) {
    if (!payload.shareConsent) {
      toast('설계사 연락요청에는 연락정보 처리 동의가 필요합니다. AI 대화 공유는 선택입니다.');
      return;
    }
    const submit = form?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch(`${API}/api/consultations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '상담요청 저장 실패');
      saveAccess(body.consultation, body.accessToken);
      form?.reset();
      form?.classList.add('hidden');
      toast(body.consultation?.transcriptShared
        ? '상담요청과 선택한 AI 대화가 암호화되어 등록되었습니다.'
        : '상담요청이 등록되었습니다. AI 대화 원문은 공유하지 않았습니다.');
    } catch (error) {
      console.error('Insurance handoff bridge', error);
      toast('상담요청 서버 연결을 확인해 주세요. 브라우저의 보험관리 기록은 그대로 유지됩니다.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }
  async function revokeConsultation(item, button) {
    if (!item?.id || !item?.accessToken) return;
    if (button) button.disabled = true;
    try {
      const response = await fetch(`${API}/api/consultations/${encodeURIComponent(item.id)}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: item.accessToken })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '상담요청 철회 실패');
      writeAccess(loadAccess().filter(entry => entry.id !== item.id));
      toast('상담요청을 철회하고 서버의 연락처·공유대화 암호문을 제거했습니다.');
    } catch (error) {
      console.error('Insurance consultation revoke', error);
      toast('상담요청 철회에 실패했습니다. 네트워크 연결을 확인해 주세요.');
      if (button) button.disabled = false;
    }
  }
  function renderWithdrawalPanel() {
    const privacy = document.getElementById('privacy');
    if (!privacy) return;
    let panel = document.getElementById('serverConsultationPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'serverConsultationPanel';
      panel.className = 'panel';
      panel.innerHTML = '<div class="panel-head"><div><p class="eyebrow">SERVER CONSULTATIONS</p><h3>설계사 상담요청 관리</h3></div><span class="pill neutral" id="serverConsultationCount">0건</span></div><p class="muted">이 브라우저에서 요청한 서버 상담만 표시합니다. 철회하면 서버의 암호화 연락처와 선택 공유대화가 제거됩니다.</p><div id="serverConsultationList" class="list-empty">현재 브라우저에 철회 가능한 상담요청 기록이 없습니다.</div>';
      privacy.append(panel);
    }
    const items = loadAccess();
    const count = panel.querySelector('#serverConsultationCount');
    const list = panel.querySelector('#serverConsultationList');
    if (count) count.textContent = `${items.length}건`;
    if (!list) return;
    if (!items.length) {
      list.className = 'list-empty';
      list.textContent = '현재 브라우저에 철회 가능한 상담요청 기록이 없습니다.';
      return;
    }
    list.className = '';
    list.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('article');
      row.className = 'policy-item';
      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = '설계사 상담요청';
      const small = document.createElement('small');
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '요청시각 미상';
      small.textContent = `${date} · ${item.id}`;
      info.append(strong, small);
      const actions = document.createElement('div');
      actions.className = 'policy-actions';
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'danger-link';
      revoke.textContent = '상담요청 철회';
      revoke.addEventListener('click', () => revokeConsultation(item, revoke));
      actions.append(revoke);
      row.append(info, actions);
      list.append(row);
    });
  }
  async function loadReferenceCatalog() {
    const host = document.getElementById('insuranceReferenceCatalog');
    const gate = document.getElementById('insuranceCatalogGate');
    const count = document.getElementById('insuranceCatalogCount');
    if (!host || !gate || !count) return;
    try {
      const response = await fetch(`${API}/api/network/catalog`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'catalog unavailable');
      const items = Array.isArray(data.items) ? data.items : [];
      count.textContent = `${items.length}건`;
      gate.textContent = data.enabled ? '참고자료 게이트 열림 · 순위/추천 없이 표시' : '컴플라이언스 게이트 닫힘 · 상품 노출 없음';
      host.replaceChildren();
      if (!data.enabled || !items.length) { host.className = 'list-empty'; host.textContent = '현재 공개 가능한 보험 참고자료가 없습니다.'; return; }
      host.className = '';
      items.forEach(item => {
        const article=document.createElement('article'); article.className='policy-item';
        const info=document.createElement('div'); const strong=document.createElement('strong'); strong.textContent=item.itemName || '보험 참고자료';
        const small=document.createElement('small'); small.textContent=[item.insurerName,item.category,item.partnerName].filter(Boolean).join(' · '); info.append(strong,small); article.append(info);
        if (item.landingUrl) { const actions=document.createElement('div'); actions.className='policy-actions'; const link=document.createElement('a'); link.href=item.landingUrl; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent='공식자료'; actions.append(link); article.append(actions); }
        host.append(article);
      });
    } catch (error) { console.error('Insurance reference catalog', error); gate.textContent='게이트 상태 확인 실패'; count.textContent='0건'; host.className='list-empty'; host.textContent='현재 참고자료를 표시할 수 없습니다.'; }
  }

  function reviseHandoffCopy(root = document) {
    root.querySelectorAll?.('form').forEach(form => {
      if (!handoffForm(form)) return;
      ensureConsentFields(form);
      const button = form.querySelector('button[type="submit"]');
      if (button && /상담|연결|저장|등록/.test(button.textContent || '')) button.textContent = '설계사 상담 요청';
      const contact = form.querySelector('[name="contact"]');
      if (contact) contact.placeholder = '상담요청 시 암호화 저장됩니다.';
    });
    if (root instanceof HTMLFormElement && handoffForm(root)) ensureConsentFields(root);
    root.querySelectorAll?.('.chat-head small').forEach(el => { el.textContent = 'FREE MODE · 대화는 기본 로컬 저장'; });
    root.querySelectorAll?.('.chat-panel .notice').forEach(el => {
      el.textContent = 'AI 대화는 기본적으로 브라우저에만 남습니다. 실제 설계사 연결 시 연락정보만 필수 처리하며, AI 대화 원문 공유는 별도로 선택할 수 있습니다.';
    });
    root.querySelectorAll?.('.admin-preview-link').forEach(link => {
      link.textContent = IS_PRODUCTION_UI ? '상담관리 →' : '스테이징 상담관리 보기 →';
      if (IS_PRODUCTION_UI) link.href = 'https://admin.ekodi.kr/';
    });
    renderWithdrawalPanel();
  }

  document.addEventListener('submit', event => {
    if (!handoffForm(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const payload = formSnapshot(event.target);
    if (payload?.name && payload?.contact) queueMicrotask(() => submitHandoff(payload, event.target));
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) reviseHandoffCopy(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', event => { if (event.target.closest('[data-view="compare"]')) queueMicrotask(loadReferenceCatalog); });
  document.addEventListener('DOMContentLoaded', () => { reviseHandoffCopy(); loadReferenceCatalog(); });
})();