(() => {
  const STAGING_API = 'https://insurance-api-staging.ekodi.kr';
  const PRODUCTION_API = 'https://insurance-api.ekodi.kr';
  const API = location.hostname === 'ins.ekodi.kr' ? PRODUCTION_API : STAGING_API;
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
  function formSnapshot(form) {
    const data = Object.fromEntries(new FormData(form));
    const checkbox = form.querySelector('input[type="checkbox"]');
    return {
      name: String(data.name || '').trim(),
      contact: String(data.contact || '').trim(),
      preferredTime: String(data.preferredTime || data.time || '').trim(),
      topic: String(data.topic || '').trim(),
      shareConsent: Boolean(checkbox?.checked),
      shareTranscript: Boolean(checkbox?.checked),
      messages: currentMessages()
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
      toast('실제 설계사 연결에는 연락처와 상담내용 공유 동의가 필요합니다.');
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
      toast('설계사 상담요청이 안전하게 등록되었습니다. 담당자가 확인 후 연락드립니다.');
    } catch (error) {
      console.error('Insurance handoff bridge', error);
      toast('상담요청 서버 연결을 확인해 주세요. 로컬 상담내용은 그대로 유지됩니다.');
    }
  }
  function reviseHandoffCopy(root = document) {
    root.querySelectorAll('form').forEach(form => {
      if (!handoffForm(form)) return;
      const consent = form.querySelector('.consent-box label span');
      if (consent) consent.textContent = '요청 시에만 연락처를 암호화해 상담대기열에 저장하고, 공유에 동의한 AI 상담내용만 담당자가 확인합니다.';
      const button = form.querySelector('button[type="submit"]');
      if (button && /상담|연결|저장/.test(button.textContent || '')) button.textContent = '설계사 상담 요청';
      const contact = form.querySelector('[name="contact"]');
      if (contact) contact.placeholder = '요청 시 암호화 저장됩니다.';
    });
    root.querySelectorAll('.chat-head small').forEach(el => { el.textContent = 'FREE MODE · 대화는 기본 로컬 저장'; });
    root.querySelectorAll('.chat-panel .notice').forEach(el => {
      el.textContent = 'AI 대화는 기본적으로 브라우저에만 남습니다. 실제 설계사 연결을 요청하고 동의한 경우에만 필요한 상담내용을 암호화해 전달합니다.';
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
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) reviseHandoffCopy(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => reviseHandoffCopy());
})();
