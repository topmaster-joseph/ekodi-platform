(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const SAFE_ACTION_RE = /(고쳐|복구|해결|수정해|개선해|처리해|바꿔|적용해|정리해|fix|repair|update|improve)/i;
  const HUMAN_GATE_RE = /(삭제|지워|초기화|drop|결제|가격|요금|수수료|관리자\s*권한|개인정보|privacy|dns|도메인\s*(이전|삭제|변경)|계약|비용\s*(발생|지불|결제)|서비스\s*(종료|폐쇄))/i;
  let pendingResult = null;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function shouldAutoPreflight(text) {
    return SAFE_ACTION_RE.test(String(text || '')) && !HUMAN_GATE_RE.test(String(text || ''));
  }

  function ensureStatus(form) {
    let status = document.querySelector('#aiAutoActionStatus');
    if (status) return status;
    status = document.createElement('div');
    status.id = 'aiAutoActionStatus';
    status.className = 'ai-auto-action-status';
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.insertAdjacentElement('afterend', status);
    return status;
  }

  async function runAuditedHealthPreflight(text) {
    const scope = document.querySelector('#aiChiefChatScope')?.value || 'all';
    const currentToken = token();
    if (!currentToken) throw new Error('관리자 인증 세션이 없습니다.');
    const response = await fetch(`${API}/api/control/ai/actions`, {
      method:'POST',
      cache:'no-store',
      headers:{
        authorization:`Bearer ${currentToken}`,
        'content-type':'application/json',
      },
      body:JSON.stringify({
        agentId:'chief',
        actionType:'service.health_check',
        area:'health_checks',
        target:scope,
        rationale:`관리자 실행 요청 사전점검: ${String(text).slice(0, 700)}`,
        payload:{ scope, source:'admin-command-surface' },
        reversible:true,
        delegated:true,
        preflightVerified:true,
      }),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `자동점검 실패 (${response.status})`);
    return data;
  }

  function simplifyAssistantCopy(node) {
    if (!node) return;
    let text = node.textContent || '';
    text = text
      .replace(/담당은\s+[^\n]+?\s+Site AI이고,\s*책임 범위는/g, '운영 범위는')
      .replace(/해당 Site AI 기준으로/g, '현재 운영 문맥을 기준으로')
      .replace(/Site AI와 운영상태를/g, '운영상태와 실행 가능 범위를');
    node.textContent = text;
  }

  function decoratePendingResult() {
    if (!pendingResult) return;
    const assistants = Array.from(document.querySelectorAll('#aiChiefChatMessages .ai-chat-message.assistant'));
    if (assistants.length <= pendingResult.assistantCountBefore) return;
    const latest = assistants.at(-1);
    const bubble = latest?.querySelector('.ai-chat-bubble');
    const text = bubble?.querySelector('.ai-chat-text');
    if (!bubble || !text) return;

    simplifyAssistantCopy(text);
    const result = document.createElement('div');
    result.className = `ai-auto-action-result${pendingResult.ok ? '' : ' is-warning'}`;
    result.textContent = pendingResult.ok
      ? '자동 조치 1단계 완료 · 실시간 상태 재점검을 실행하고 감사기록을 남겼습니다. 안전 범위의 작업은 시스템이 계속 우선 처리하고, 승인 대상만 따로 올립니다.'
      : '자동 조치 1단계를 시도했지만 실시간 재점검을 완료하지 못했습니다. 운영 설정은 변경하지 않았습니다.';
    const meta = bubble.querySelector('.ai-chat-meta');
    if (meta?.nextSibling) bubble.insertBefore(result, meta.nextSibling);
    else bubble.prepend(result);
    pendingResult = null;
  }

  function simplifyContext() {
    document.querySelectorAll('#aiChiefChatContext .ai-chat-context-row').forEach(row => {
      const label = row.querySelector('small');
      const value = row.querySelector('strong');
      if (!label || !value) return;
      if (label.textContent === '담당') {
        label.textContent = '처리 방식';
        value.textContent = 'EKODI 자동 오케스트레이션';
      } else if (label.textContent === 'Council') {
        label.textContent = '내부 검토';
        value.textContent = '필요한 전문 기능 자동 선택';
      } else if (label.textContent === '실행 경계') {
        value.textContent = '안전조치 자동 · 중요한 변경만 승인';
      }
    });
  }

  function simplifyDynamicText(root) {
    root.querySelectorAll?.('.ai-chat-typing').forEach(node => {
      node.textContent = '운영 상태를 확인하고 가능한 조치를 실행 중…';
    });
    simplifyContext();
    decoratePendingResult();
  }

  function enhance() {
    const chat = document.querySelector('#aiChiefChat');
    const form = document.querySelector('#aiChiefChatForm');
    const input = document.querySelector('#aiChiefChatInput');
    const send = document.querySelector('#aiChiefChatSend');
    const messages = document.querySelector('#aiChiefChatMessages');
    if (!chat || !form || !input || !send || !messages || chat.dataset.readableCommandReady === 'true') return false;

    chat.dataset.readableCommandReady = 'true';
    const headerSmall = chat.querySelector('.ai-chat-head small');
    const headerTitle = chat.querySelector('.ai-chat-head h3');
    if (headerSmall) headerSmall.textContent = 'EKODI AI COMMAND';
    if (headerTitle) headerTitle.textContent = '무엇을 할까요?';
    input.placeholder = '예: marketing.ekodi.kr 모바일 화면이 이상해. 점검하고 가능한 범위에서 바로 조치해줘';
    send.textContent = '실행';

    const foot = chat.querySelector('.ai-chat-foot');
    if (foot) {
      foot.replaceChildren();
      const auto = document.createElement('span');
      auto.textContent = '가능한 안전조치는 먼저 실행합니다.';
      const gate = document.createElement('span');
      gate.textContent = '삭제·결제·권한·핵심 설정만 관리자 승인';
      foot.append(auto, gate);
    }

    const greeting = messages.querySelector('.ai-chat-message.assistant .ai-chat-text');
    if (greeting && /운영대화가 준비되었습니다|담당 AI가 누구야/.test(greeting.textContent || '')) {
      greeting.textContent = 'EKODI 운영 명령창입니다. 원하는 결과를 그대로 말씀해 주세요. 필요한 전문 기능은 내부에서 자동으로 선택하고, 가능한 안전조치는 먼저 실행한 뒤 결과를 보고합니다.';
    }

    ensureStatus(form);
    simplifyContext();

    form.addEventListener('submit', async event => {
      if (form.dataset.ekodiPreflight === 'done') {
        delete form.dataset.ekodiPreflight;
        return;
      }
      const text = String(input.value || '').trim();
      if (!shouldAutoPreflight(text)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const status = ensureStatus(form);
      status.hidden = false;
      status.textContent = '자동 실행 준비 · 현재 상태와 영향 범위를 먼저 재점검하고 있습니다.';
      send.disabled = true;
      const assistantCountBefore = messages.querySelectorAll('.ai-chat-message.assistant').length;
      try {
        const action = await runAuditedHealthPreflight(text);
        pendingResult = { ok:Boolean(action.ok), assistantCountBefore };
        status.textContent = action.ok
          ? '사전점검 완료 · 안전 범위에서 요청 처리를 계속합니다.'
          : '사전점검 결과를 확인했습니다. 운영 변경 없이 다음 판단으로 넘어갑니다.';
      } catch (error) {
        pendingResult = { ok:false, assistantCountBefore };
        status.textContent = `사전점검을 완료하지 못했습니다 · ${error.message || '연결 오류'}`;
      } finally {
        send.disabled = false;
        form.dataset.ekodiPreflight = 'done';
        form.requestSubmit();
        window.setTimeout(() => { status.hidden = true; }, 2200);
      }
    }, true);

    const messageObserver = new MutationObserver(() => simplifyDynamicText(messages));
    messageObserver.observe(messages, { childList:true, subtree:true });
    const context = document.querySelector('#aiChiefChatContext');
    if (context) {
      const contextObserver = new MutationObserver(simplifyContext);
      contextObserver.observe(context, { childList:true, subtree:true });
    }
    simplifyDynamicText(messages);
    return true;
  }

  const panel = document.querySelector('#aiOpsPanel');
  if (enhance()) return;
  const root = panel || document.body;
  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });
  observer.observe(root, { childList:true, subtree:true });
  window.setTimeout(() => observer.disconnect(), 5000);
})();
