(() => {
  const STAGING_API = 'https://insurance-api-staging.ekodi.kr';
  const GREEN_API = 'https://ekodi-insurance-api-green.topmaster-joseph.workers.dev';
  const PRODUCTION_API = 'https://insurance-api.ekodi.kr';
  const API = location.hostname === 'ins.ekodi.kr'
    ? PRODUCTION_API
    : location.hostname === 'ekodi-insurance-green.topmaster-joseph.workers.dev'
      ? GREEN_API
      : STAGING_API;
  const STATE_KEY = 'ekodi-insurance-staging-v3';
  const ACCESS_KEY = 'ekodi-insurance-consultation-access-v1';
  const snapshots = new WeakMap();

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
    let items = [];
    try { items = JSON.parse(localStorage.getItem(ACCESS_KEY) || '[]'); } catch {}
    if (!Array.isArray(items)) items = [];
    items.unshift({ id: consultation.id, accessToken, status: consultation.status, createdAt: consultation.createdAt });
    localStorage.setItem(ACCESS_KEY, JSON.stringify(items.slice(0, 20)));
  }
  async function submitHandoff(payload) {
    if (!payload.shareConsent) {
      toast('설계사 연락요청에는 연락정보 처리 동의가 필요합니다. AI 대화 공유는 선택입니다.');
      return;
    }
    try {
      const response = await fetch(`${API}/api/consultations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '상담요청 저장 실패');
      saveAccess(body.consultation, body.accessToken);
      toast(body.consultation?.transcriptShared
        ? '상담요청과 선택한 AI 대화가 암호화되어 등록되었습니다.'
        : '상담요청이 등록되었습니다. AI 대화 원문은 공유하지 않았습니다.');
    } catch (error) {
      console.error('Insurance handoff bridge', error);
      toast('상담요청 서버 연결을 확인해 주세요. 브라우저의 보험관리 기록은 그대로 유지됩니다.');
    }
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
  }

  document.addEventListener('submit', event => {
    if (handoffForm(event.target)) snapshots.set(event.target, formSnapshot(event.target));
  }, true);
  document.addEventListener('submit', event => {
    if (!handoffForm(event.target)) return;
    const payload = snapshots.get(event.target);
    snapshots.delete(event.target);
    if (payload?.name && payload?.contact) queueMicrotask(() => submitHandoff(payload));
  });

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) reviseHandoffCopy(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => reviseHandoffCopy());
})();