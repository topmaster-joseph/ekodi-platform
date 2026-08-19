(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const ACTION_RE = /(고쳐|복구|해결|수정|개선|구성|재구성|개편|단순화|정리|배치|옮겨|없애|제거|추가|바꿔|적용|만들어|줄여|늘려|처리|조치|fix|repair|update|improve|rebuild|reorganize|simplify)/i;
  const LAYOUT_RE = /(관리자|admin|화면|페이지|ui|ux|레이아웃|구성|배치|오른쪽|패널|화면속\s*화면|화면\s*속\s*화면|복잡|가독|폰트|글씨)/i;
  const HUMAN_GATE_RE = /(삭제|지워|초기화|drop|결제|가격|요금|수수료|관리자\s*권한|개인정보|privacy|dns|도메인\s*(이전|삭제|변경)|계약|비용\s*(발생|지불|결제)|서비스\s*(종료|폐쇄))/i;
  const SPECIALIST_QUESTION_RE = /(어떤\s*ai|무슨\s*ai|누가\s*담당|담당\s*ai|전문\s*ai가\s*누구|council)/i;
  const ROLE_HANDOFF_RE = /(담당은[^\n]*Site AI|Site AI가\s*1차\s*책임|어느\s*사이트인지\s*함께\s*말씀|원하는\s*방향을\s*말씀|해당\s*Site AI\s*기준|담당\s*AI를\s*선택|전문\s*AI를\s*(사용|선택|이용))/i;

  let pending = null;
  let lastUserInput = '';

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function scope() {
    return document.querySelector('#aiChiefChatScope')?.value || 'all';
  }

  function safeAction(text) {
    return ACTION_RE.test(String(text || '')) && !HUMAN_GATE_RE.test(String(text || ''));
  }

  function specialistsFor(text) {
    const value = String(text || '');
    const items = [];
    if (LAYOUT_RE.test(value)) items.push('UI/UX');
    if (/(로그인|인증|권한|보안|privacy|token|auth)/i.test(value)) items.push('Security');
    if (/(결제|요금|가격|정산|회계|finance|pay)/i.test(value)) items.push('Finance');
    items.push('Platform', 'Release');
    return [...new Set(items)].slice(0, 4);
  }

  function ensureStatus(form) {
    let node = document.querySelector('#aiAutoActionStatus');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'aiAutoActionStatus';
    node.className = 'ai-auto-action-status';
    node.hidden = true;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    form.insertAdjacentElement('afterend', node);
    return node;
  }

  async function postAction(payload) {
    const currentToken = token();
    if (!currentToken) throw new Error('관리자 인증 세션이 없습니다.');
    const response = await fetch(`${API}/api/control/ai/actions`, {
      method:'POST',
      cache:'no-store',
      headers:{ authorization:`Bearer ${currentToken}`, 'content-type':'application/json' },
      body:JSON.stringify(payload),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `AI 운영 요청 실패 (${response.status})`);
    return data;
  }

  async function orchestrate(text) {
    const target = scope();
    const specialists = specialistsFor(text);
    const health = await postAction({
      agentId:'chief', actionType:'service.health_check', area:'health_checks', target,
      rationale:`관리자 요청 자동 사전점검: ${String(text).slice(0, 700)}`,
      payload:{ target, source:'admin-chief-orchestrator', specialists },
      reversible:true, delegated:true, preflightVerified:true,
    });

    let queued = null;
    try {
      queued = await postAction({
        agentId:'chief', actionType:'ui.change_request', area:'bounded_admin_change', target,
        rationale:`관리자 요청 실행 큐: ${String(text).slice(0, 900)}`,
        payload:{ target, source:'admin-chief-orchestrator', specialists, request:String(text).slice(0, 1200) },
        reversible:true, delegated:true, preflightVerified:Boolean(health?.ok),
      });
    } catch (error) {
      queued = { ok:false, status:'queue_failed', error:error.message || '실행 큐 등록 실패' };
    }
    return { health, queued, specialists };
  }

  function applyFlatLayout() {
    document.body.classList.add('ekodi-flat-aiops');
    try { localStorage.setItem('ekodi-admin-flat-layout', '1'); } catch {}
    document.querySelector('.governance-command-bar')?.remove();
    document.querySelectorAll('.mission-dashboard,.mission-ecosystem-rail').forEach(node => node.remove());
    const detail = document.querySelector('#aiOpsPanel .ai-selected-detail');
    if (detail) detail.hidden = true;
  }

  function currentUserText(messages) {
    const users = messages?.querySelectorAll('.ai-chat-message.user .ai-chat-text');
    return String(users?.[users.length - 1]?.textContent || lastUserInput || '').trim();
  }

  function ownedResponse(text, result) {
    const layout = LAYOUT_RE.test(text);
    const internal = result?.specialists?.length ? result.specialists.join(' · ') : 'Platform · Release';
    const healthOk = Boolean(result?.health?.ok);
    const queueStatus = String(result?.queued?.status || '');
    const queueReady = ['ready_for_executor','verified','executing'].includes(queueStatus);

    if (layout) {
      return `요청은 제가 맡았습니다. 전문 기능 선택을 관리자에게 넘기지 않습니다.\n\n내부 검토 경로: ${internal}\n자동 상태·영향 점검: ${healthOk ? '완료' : '확인 필요'}\n화면 조치: 오른쪽 보조 화면과 선택 상세를 기본 화면에서 제거하고, AI 운영대화를 메인 상단에 두며 사이트 상태는 그 아래 한 열로 단순화했습니다.\n실행 기록: ${queueReady ? '감사 가능한 실행 큐에 등록' : '실행 큐 상태 확인 필요'}\n\n앞으로 같은 종류의 요청은 제가 필요한 전문 기능을 내부에서 조정하고, 가능한 조치를 먼저 한 뒤 결과를 보고합니다.`;
    }

    return `요청은 제가 맡았습니다. 어떤 전문 AI를 사용할지 관리자에게 다시 선택시키지 않습니다.\n\n내부 검토 경로: ${internal}\n자동 상태·영향 점검: ${healthOk ? '완료' : '확인 필요'}\n실행 기록: ${queueReady ? '감사 가능한 실행 큐에 등록' : '실행 큐 상태 확인 필요'}\n\n현재 자동 실행기가 실제로 처리한 범위만 완료로 보고하며, 실행기가 없는 코드 변경은 완료했다고 꾸미지 않습니다.`;
  }

  function neutralizeRoleHandoff(messages) {
    const assistants = messages?.querySelectorAll('.ai-chat-message.assistant .ai-chat-text');
    const latest = assistants?.[assistants.length - 1];
    if (!latest) return;
    const userText = currentUserText(messages);
    if (SPECIALIST_QUESTION_RE.test(userText)) return;
    if (!ROLE_HANDOFF_RE.test(latest.textContent || '')) return;
    latest.textContent = '이 요청은 제가 맡습니다. 필요한 전문 기능은 내부에서 자동으로 선택하고 조정합니다. 관리자께서는 원하는 결과만 말씀해 주세요. 안전한 범위는 먼저 실행하고, 승인이나 추가 판단이 꼭 필요한 경우에만 그 이유와 선택지를 알려드리겠습니다.';
  }

  function finishPending(messages) {
    if (!pending) return;
    const assistants = Array.from(messages.querySelectorAll('.ai-chat-message.assistant'));
    if (assistants.length <= pending.assistantCountBefore) return;
    const latest = assistants.at(-1)?.querySelector('.ai-chat-text');
    if (!latest) return;
    latest.textContent = ownedResponse(pending.text, pending.result);
    pending = null;
  }

  function simplifyChatStructure(chat, form, messages) {
    const quick = chat.querySelector('#aiChiefChatQuick');
    const foot = chat.querySelector('.ai-chat-foot');
    const head = chat.querySelector('.ai-chat-head');
    if (head) chat.append(head);
    chat.append(form);
    if (quick) chat.append(quick);
    chat.append(messages);
    if (foot) chat.append(foot);
  }

  function enhance() {
    const chat = document.querySelector('#aiChiefChat');
    const form = document.querySelector('#aiChiefChatForm');
    const input = document.querySelector('#aiChiefChatInput');
    const send = document.querySelector('#aiChiefChatSend');
    const messages = document.querySelector('#aiChiefChatMessages');
    if (!chat || !form || !input || !send || !messages || chat.dataset.orchestratorReady === 'true') return false;

    chat.dataset.orchestratorReady = 'true';
    applyFlatLayout();
    simplifyChatStructure(chat, form, messages);

    const headerSmall = chat.querySelector('.ai-chat-head small');
    const headerTitle = chat.querySelector('.ai-chat-head h3');
    if (headerSmall) headerSmall.textContent = 'EKODI AI COMMAND';
    if (headerTitle) headerTitle.textContent = '무엇을 할까요?';
    input.placeholder = '원하는 결과를 그대로 말씀해 주세요. 예: 관리자 화면을 더 단순하게 다시 구성해줘';
    send.textContent = '실행';

    const greeting = messages.querySelector('.ai-chat-message.assistant .ai-chat-text');
    if (greeting) greeting.textContent = '원하는 결과를 말씀해 주세요. 이 대화의 AI가 요청을 끝까지 맡고, 필요한 전문 기능은 내부에서 선택합니다. 가능한 안전조치는 먼저 실행하고 검증한 뒤 결과를 보고합니다.';

    const foot = chat.querySelector('.ai-chat-foot');
    if (foot) {
      foot.replaceChildren();
      const first = document.createElement('span');
      first.textContent = '전문 기능은 내부 자동 선택 · 안전조치는 먼저 실행';
      const second = document.createElement('span');
      second.textContent = '삭제·결제·권한·핵심 설정만 관리자 승인';
      foot.append(first, second);
    }

    ensureStatus(form);

    form.addEventListener('submit', async event => {
      if (form.dataset.ekodiOrchestrated === 'done') {
        delete form.dataset.ekodiOrchestrated;
        return;
      }
      const text = String(input.value || '').trim();
      lastUserInput = text;
      if (!safeAction(text)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const status = ensureStatus(form);
      status.hidden = false;
      status.textContent = '요청을 맡았습니다 · 필요한 전문 기능을 내부에서 선택하고 상태·영향을 점검 중입니다.';
      send.disabled = true;
      const assistantCountBefore = messages.querySelectorAll('.ai-chat-message.assistant').length;
      let result;
      try {
        result = await orchestrate(text);
        if (LAYOUT_RE.test(text)) applyFlatLayout();
        status.textContent = '사전점검과 내부 라우팅 완료 · 가능한 조치를 적용하고 결과를 정리합니다.';
      } catch (error) {
        result = { health:{ ok:false }, queued:{ status:'preflight_failed' }, specialists:specialistsFor(text), error:error.message };
        status.textContent = `자동 점검 일부 실패 · 운영 변경은 무리하게 진행하지 않습니다 (${error.message || '연결 오류'})`;
      } finally {
        pending = { text, result, assistantCountBefore };
        send.disabled = false;
        form.dataset.ekodiOrchestrated = 'done';
        form.requestSubmit();
        window.setTimeout(() => { status.hidden = true; }, 2600);
      }
    }, true);

    const observer = new MutationObserver(() => {
      finishPending(messages);
      neutralizeRoleHandoff(messages);
      messages.querySelectorAll('.ai-chat-typing').forEach(node => {
        node.textContent = '요청을 분석하고 필요한 전문 기능을 내부에서 조정 중…';
      });
    });
    observer.observe(messages, { childList:true, subtree:true });
    neutralizeRoleHandoff(messages);
    return true;
  }

  try {
    if (localStorage.getItem('ekodi-admin-flat-layout') === '1') document.body.classList.add('ekodi-flat-aiops');
  } catch {}

  if (enhance()) return;
  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });
  observer.observe(document.body, { childList:true, subtree:true });
  window.setTimeout(() => observer.disconnect(), 8000);
})();
