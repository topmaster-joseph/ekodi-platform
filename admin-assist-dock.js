(() => {
  'use strict';
  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const STATE_KEY='ekodi-assist-state-v2';
  const HISTORY_KEY='ekodi-admin-command-history-v1';
  const MAX_SESSIONS=24;
  const MAX_MESSAGES=24;
  const HIGH_RISK=[
    {re:/(계약|법적|위약|서명|contract)/i,area:'legal_commitment_or_contract_execution'},
    {re:/(고액|대금|지불|결제|환불|가격|요금|수수료|financial|payment|refund)/i,area:'high_value_or_exceptional_financial_commitment'},
    {re:/(전체\s*삭제|대량\s*삭제|초기화|drop|테이블\s*삭제|db\s*삭제)/i,area:'destructive_or_mass_data_change'},
    {re:/(개인정보|identity\s*merge|계정\s*병합|privacy)/i,area:'identity_merge_or_irreversible_privacy_change'},
    {re:/(관리자\s*권한|권한\s*(삭제|해제|축소)|user\s*rights)/i,area:'policy_change_that_materially_reduces_user_rights'},
    {re:/(도메인\s*(이전|삭제)|서비스\s*(종료|폐쇄)|ownership\s*transfer|shutdown)/i,area:'domain_service_shutdown_or_ownership_transfer'},
  ];
  const HEALTH_RE=/(상태|점검|장애|이상|느려|오류|health|status|incident)/i;
  const ACTION_RE=/(수정|바꿔|변경|고쳐|조치|적용|구축|연동|배포|재구성|정리|없애|옮겨|추가|만들어|fix|change|deploy|build|connect|apply|update)/i;
  let inbox=[];
  let actions=[];
  let activeThread=null;
  let aiHistory=[];
  let lastAiReply=null;
  let sessions=loadSessions();
  let state=loadState();
  let root=null;
  let railOpen=false;

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function headers(json=false){const h=token()?{authorization:`Bearer ${token()}`}:{ };if(json)h['content-type']='application/json';return h}
  function loadState(){try{return {...{open:false,tab:'ai',activeSessionId:null,query:''},...JSON.parse(sessionStorage.getItem(STATE_KEY)||'{}')}}catch{return{open:false,tab:'ai',activeSessionId:null,query:''}}}
  function saveState(){try{sessionStorage.setItem(STATE_KEY,JSON.stringify({open:state.open,tab:state.tab,activeSessionId:state.activeSessionId,query:state.query||''}))}catch{}}
  function loadSessions(){try{const value=JSON.parse(sessionStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(value)?value.slice(0,MAX_SESSIONS):[]}catch{return[]}}
  function saveSessions(){try{sessionStorage.setItem(HISTORY_KEY,JSON.stringify(sessions.slice(0,MAX_SESSIONS)))}catch{}}
  function esc(text){return String(text??'')}
  function now(){return new Date().toISOString()}
  function titleFor(text){const value=String(text||'').replace(/\s+/g,' ').trim();return value.length>44?`${value.slice(0,44)}…`:value||'새 명령'}
  function rememberAi(role,text){const value=String(text||'').trim();if(!value)return;aiHistory.push({role,text:value.slice(0,2000)});if(aiHistory.length>8)aiHistory=aiHistory.slice(-8)}
  function context(){
    const active=document.querySelector('.sidebar .nav.active[data-section]');
    const section=active?.dataset.section||location.hash.replace(/^#/,'')||'overview';
    const title=document.querySelector('#pageTitle')?.textContent?.trim()||section||'Admin';
    return {section,title,hash:location.hash||'',pathname:location.pathname};
  }
  async function api(path,options={}){
    const response=await fetch(`${API}${path}`,{cache:'no-store',...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})}});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data.error||data.message||`요청 실패 (${response.status})`);
    return data;
  }
  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=esc(text);return node}
  function statusLabel(value){const map={waiting_human:'담당자 확인 대기',open:'AI 응답',resolved:'완료',archived:'보관',accepted:'담당자 응답 중',requested:'연결 대기',awaiting_human:'승인 대기',verified:'완료',ready_for_executor:'실행 대기',assist_only:'검토',blocked:'차단',failed:'실패',approved_pending_executor:'승인됨'};return map[value]||value||'확인'}
  function priorityLabel(value){if(value==='urgent')return'긴급';if(value==='review')return'확인 필요';return'일반'}
  function positionWorkbench(){
    const sidebar=document.querySelector('.sidebar');
    const right=sidebar?.getBoundingClientRect?.().right||0;
    document.documentElement.style.setProperty('--ekodi-assist-left',`${Math.max(0,Math.round(right))}px`);
  }
  function activeSession(){return sessions.find(item=>item.id===state.activeSessionId)||null}
  function currentSection(){return String(context().section||'overview')}
  function selectSessionForCurrentSection(){const section=currentSection();const current=activeSession();if(current?.context?.section===section)return false;state.activeSessionId=sessions.find(item=>item.context?.section===section)?.id||null;state.query='';saveState();rebuildHistory();return true}
  function rebuildHistory(){
    const current=activeSession();
    aiHistory=(current?.messages||[]).filter(item=>item.role==='user'||item.role==='assistant').slice(-8).map(item=>({role:item.role,text:item.text}));
    const last=[...(current?.messages||[])].reverse().find(item=>item.role==='assistant');
    lastAiReply=last?{text:last.text,mode:last.mode||'history',provider:last.provider||null,notice:last.notice||''}:null;
  }
  function ensureSession(firstText){
    let session=activeSession();
    if(session?.context?.section===currentSection())return session;
    state.activeSessionId=null;
    session={id:`cmd-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:titleFor(firstText),createdAt:now(),updatedAt:now(),context:context(),status:'active',messages:[]};
    sessions.unshift(session);sessions=sessions.slice(0,MAX_SESSIONS);state.activeSessionId=session.id;saveState();saveSessions();return session;
  }
  function addSessionMessage(role,text,extra={}){
    const value=String(text||'').trim();if(!value)return;
    const session=ensureSession(value);
    session.messages.push({role,text:value.slice(0,4000),at:now(),...extra});
    if(session.messages.length>MAX_MESSAGES)session.messages=session.messages.slice(-MAX_MESSAGES);
    session.updatedAt=now();if(extra.status)session.status=extra.status;
    sessions=[session,...sessions.filter(item=>item.id!==session.id)].slice(0,MAX_SESSIONS);
    saveSessions();renderRail();
  }

  function install(){
    if(document.querySelector('#ekodiAssistDock')||!token())return;
    positionWorkbench();
    root=el('div','ekodi-assist');root.id='ekodiAssistDock';
    root.innerHTML='<button type="button" class="ekodi-assist-launcher" id="ekodiAssistLauncher" aria-label="EKODI AI 열기" aria-expanded="false">✦<span class="ekodi-assist-badge" id="ekodiAssistBadge" hidden></span></button><section class="ekodi-assist-panel" id="ekodiAssistPanel" hidden aria-label="EKODI AI 명령 워크벤치"><aside class="ekodi-assist-rail" id="ekodiAssistRail"><div class="ekodi-assist-rail-head"><strong id="ekodiAssistRailTitle">최근 명령</strong><button type="button" id="ekodiAssistNew" aria-label="새 명령">＋</button></div><div class="ekodi-assist-tabs" role="tablist"><button type="button" class="ekodi-assist-tab" data-assist-tab="ai">AI 명령</button><button type="button" class="ekodi-assist-tab" data-assist-tab="inbox">대화 · 문의</button></div><label class="ekodi-assist-search"><span>⌕</span><input id="ekodiAssistSearch" type="search" placeholder="최근 명령 검색" autocomplete="off"></label><div class="ekodi-assist-history" id="ekodiAssistHistory"></div><div class="ekodi-assist-rail-foot"><small id="ekodiAssistContext">현재 화면을 확인 중입니다.</small><a href="https://api.ekodi.kr/operator" target="_blank" rel="noopener">운영자 전체 화면 ↗</a></div></aside><main class="ekodi-assist-main"><header class="ekodi-assist-head"><button type="button" class="ekodi-assist-rail-toggle" id="ekodiAssistRailToggle" aria-label="최근 명령 보기">☰</button><div class="ekodi-assist-title"><strong id="ekodiAssistTitle">새 명령</strong><small>에코디 헌법 · AI 협업 · 권한 경계를 지키며 실행합니다.</small></div><button type="button" class="ekodi-assist-close" id="ekodiAssistClose" aria-label="관리자 화면으로 돌아가기">×</button></header><div class="ekodi-assist-chat-scroll" id="ekodiAssistChat"></div><footer class="ekodi-assist-composer-wrap" id="ekodiAssistComposer"><form class="ekodi-assist-composer" id="ekodiAssistForm"><button type="button" class="ekodi-assist-plus" id="ekodiAssistComposerNew" aria-label="새 명령">＋</button><textarea class="ekodi-assist-command" id="ekodiAssistCommand" rows="1" maxlength="1800" placeholder="에코디 AI에게 물어보세요"></textarea><button type="submit" class="ekodi-assist-send" aria-label="보내기">↑</button></form><small>Enter 전송 · Shift+Enter 줄바꿈 · 고위험 작업은 사람 승인 경계를 유지합니다.</small></footer></main></section>';
    document.body.appendChild(root);
    root.querySelector('#ekodiAssistLauncher').addEventListener('click',()=>setOpen(true));
    root.querySelector('#ekodiAssistClose').addEventListener('click',()=>setOpen(false));
    root.querySelector('#ekodiAssistNew').addEventListener('click',newCommand);
    root.querySelector('#ekodiAssistComposerNew').addEventListener('click',newCommand);
    root.querySelector('#ekodiAssistRailToggle').addEventListener('click',()=>{railOpen=!railOpen;root.classList.toggle('rail-open',railOpen)});
    root.querySelectorAll('[data-assist-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.assistTab)));
    const search=root.querySelector('#ekodiAssistSearch');search.value=state.query||'';search.addEventListener('input',()=>{state.query=search.value;saveState();renderRail()});
    const form=root.querySelector('#ekodiAssistForm');const input=root.querySelector('#ekodiAssistCommand');
    form.addEventListener('submit',event=>{event.preventDefault();const text=input.value.trim();if(!text)return;input.value='';resizeInput(input);submitAi(text)});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit()}});
    input.addEventListener('input',()=>resizeInput(input));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open)setOpen(false)});
    window.addEventListener('resize',positionWorkbench);
    window.addEventListener('ekodi-nav-changed',updateContext);
    window.addEventListener('ekodi-admin-section-changed',updateContext);
    window.addEventListener('hashchange',updateContext);
    window.addEventListener('ekodi-admin-capability-requested',event=>{const capability=event.detail?.capability;if(!capability)return;setOpen(true);setTab('ai');submitAi(`${capability.name} (${capability.id}) Capability를 현재 관리자 화면 맥락에서 사용해줘. ${capability.description||''}`)});
    window.addEventListener('ekodi-admin-assist-request',event=>{const text=String(event.detail?.text||'').trim();setOpen(true);setTab('ai');if(text)submitAi(text)});
    window.addEventListener('focus',()=>{if(document.visibilityState==='visible')refreshSummary()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSummary()});
    rebuildHistory();setTab(state.tab,false);setOpen(Boolean(state.open),false);updateContext();refreshSummary();
  }
  function resizeInput(input){input.style.height='auto';input.style.height=`${Math.min(132,Math.max(28,input.scrollHeight))}px`}
  function updateContext(){if(!root)return;positionWorkbench();const c=context();selectSessionForCurrentSection();const node=root.querySelector('#ekodiAssistContext');if(node)node.textContent=`현재: ${c.title}`;const railTitle=root.querySelector('#ekodiAssistRailTitle');if(railTitle)railTitle.textContent=`${c.title} 명령 이력`;const search=root.querySelector('#ekodiAssistSearch');if(search){search.value=state.query||'';search.placeholder=`${c.title} 명령 검색`;}if(state.open){renderRail();renderMain()}}
  function setOpen(open,persist=true){state.open=Boolean(open);const panel=root?.querySelector('#ekodiAssistPanel');const launcher=root?.querySelector('#ekodiAssistLauncher');if(panel)panel.hidden=!state.open;if(launcher){launcher.hidden=state.open;launcher.setAttribute('aria-expanded',String(state.open))}if(persist)saveState();if(state.open){positionWorkbench();renderRail();renderMain();refreshSummary();setTimeout(()=>root?.querySelector('#ekodiAssistCommand')?.focus(),0)}}
  function setTab(tab,persist=true){state.tab=tab==='inbox'?'inbox':'ai';root?.querySelectorAll('[data-assist-tab]').forEach(button=>button.classList.toggle('active',button.dataset.assistTab===state.tab));if(persist)saveState();activeThread=null;renderRail();renderMain()}
  function newCommand(){state.tab='ai';state.activeSessionId=null;state.query='';aiHistory=[];lastAiReply=null;saveState();const search=root?.querySelector('#ekodiAssistSearch');if(search)search.value='';setTab('ai',false);renderRail();renderAi();root?.querySelector('#ekodiAssistCommand')?.focus()}
  function updateBadge(){const inquiry=inbox.filter(item=>item.status==='waiting_human'||['requested','accepted'].includes(item.handoffStatus)).length;const approvals=actions.filter(item=>item.status==='awaiting_human').length;const total=inquiry+approvals;const badge=root?.querySelector('#ekodiAssistBadge');if(!badge)return;badge.hidden=total===0;badge.textContent=total>99?'99+':String(total);badge.setAttribute('aria-label',`관리자 확인 필요 ${total}건`)}
  async function refreshSummary(){if(!token())return;try{const [inboxData,actionData]=await Promise.all([api('/api/control/messenger/inbox'),api('/api/control/ai/actions?limit=20')]);inbox=Array.isArray(inboxData.inbox)?inboxData.inbox:[];actions=Array.isArray(actionData.actions)?actionData.actions:[];updateBadge();if(state.open){renderRail();renderMain()}}catch(error){if(state.open)showStatus(error.message,true)}}
  function showStatus(message,error=false){const chat=root?.querySelector('#ekodiAssistChat');if(!chat)return;let node=chat.querySelector('.ekodi-assist-live-status');if(!node){node=el('div','ekodi-assist-live-status');chat.append(node)}node.textContent=message;node.classList.toggle('error',error);scrollChat()}

  function renderRail(){
    const list=root?.querySelector('#ekodiAssistHistory');if(!list)return;list.replaceChildren();
    if(state.tab==='inbox'){renderInboxList(list);return}
    const query=String(state.query||'').trim().toLowerCase();const section=currentSection();
    const filtered=sessions.filter(session=>session.context?.section===section).filter(session=>!query||session.title.toLowerCase().includes(query)||(session.messages||[]).some(message=>String(message.text||'').toLowerCase().includes(query)));
    if(!filtered.length){list.append(el('div','ekodi-assist-empty',query?'현재 메뉴의 검색 결과가 없습니다.':`${context().title}에서 명령을 입력하면 최근 작업이 여기에 쌓입니다.`));return}
    const today=new Date().toDateString();
    for(const session of filtered){
      const button=el('button',`ekodi-assist-history-item${session.id===state.activeSessionId?' active':''}`);button.type='button';
      const meta=el('div','ekodi-assist-history-meta');meta.append(el('span','',new Date(session.updatedAt).toDateString()===today?'오늘':new Date(session.updatedAt).toLocaleDateString('ko-KR')),el('span',`status ${session.status||'active'}`,session.status==='failed'?'실패':session.status==='done'?'완료':'진행'));
      button.append(el('strong','',session.title),meta);
      button.addEventListener('click',()=>{state.activeSessionId=session.id;saveState();rebuildHistory();railOpen=false;root.classList.remove('rail-open');renderRail();renderAi()});
      list.append(button);
    }
  }
  function renderInboxList(list){
    if(!inbox.length){list.append(el('div','ekodi-assist-empty','지금 바로 확인할 중요한 대화가 없습니다.'));return}
    for(const item of inbox){const button=el('button','ekodi-assist-history-item');button.type='button';button.append(el('strong','',item.title||`대화 #${item.id}`),el('span','',item.lastMessage||statusLabel(item.handoffStatus||item.status)));button.addEventListener('click',()=>openThread(item.id));list.append(button)}
  }
  function renderMain(){state.tab==='inbox'?renderInbox():renderAi()}
  function renderAi(){
    const chat=root?.querySelector('#ekodiAssistChat');if(!chat)return;const composer=root.querySelector('#ekodiAssistComposer');if(composer)composer.hidden=false;chat.replaceChildren();const session=activeSession();const title=root.querySelector('#ekodiAssistTitle');if(title)title.textContent=session?.title||'새 명령';
    if(!session?.messages?.length){
      const welcome=el('div','ekodi-assist-welcome');welcome.append(el('div','ekodi-assist-mark','E'),el('h2','',`${context().title}에서 무엇을 도와드릴까요?`),el('p','','질문부터 상태 점검, 수정·구축 요청까지 한 창에서 이어갑니다.'));
      const quick=el('div','ekodi-assist-quick');[['현재 화면 상태 점검','현재 화면과 관련 서비스 상태를 점검해줘'],['승인 대기 보기','현재 사람 승인을 기다리는 작업을 알려줘'],['이 화면 개선점','현재 관리자 화면의 개선점을 분석해줘']].forEach(([label,text])=>{const button=el('button','',label);button.type='button';button.addEventListener('click',()=>submitAi(text));quick.append(button)});welcome.append(quick);chat.append(welcome);
    }else{
      const thread=el('div','ekodi-assist-command-thread');
      for(const message of session.messages){
        const row=el('div',`ekodi-assist-turn ${message.role||'assistant'} ${message.kind||''}`);
        const bubble=el('div','ekodi-assist-bubble',message.text);
        if(message.role==='assistant'){const who=el('div','ekodi-assist-who');who.append(el('span','ekodi-assist-avatar','E'),el('strong','',message.kind==='status'?'EKODI 작업':'에코디 AI'));row.append(who)}
        row.append(bubble);
        if(message.provider||message.status){const meta=el('small','ekodi-assist-turn-meta',[message.provider,message.status&&statusLabel(message.status)].filter(Boolean).join(' · '));row.append(meta)}
        thread.append(row);
      }
      chat.append(thread);
    }
    renderAiActions(chat,false);scrollChat();
  }
  function renderAiActions(view,onlyApprovals){
    let container=view.querySelector('.ekodi-assist-ai-result');if(container)container.remove();
    const rows=(onlyApprovals?actions.filter(item=>item.status==='awaiting_human'):actions).slice(0,5);if(!rows.length)return;
    container=el('section','ekodi-assist-ai-result');container.append(el('h3','',onlyApprovals?'승인 대기':'최근 운영 기록'));
    for(const item of rows){const row=el('div','ekodi-assist-actionrow');row.append(el('b','',`${statusLabel(item.status)} · ${item.agent_name||item.agent_id||'AI'}`),el('span','',item.rationale||item.action_type||''));container.append(row)}
    view.append(container);
  }
  function scrollChat(){requestAnimationFrame(()=>{const chat=root?.querySelector('#ekodiAssistChat');if(chat)chat.scrollTop=chat.scrollHeight})}

  function renderInbox(){
    const chat=root?.querySelector('#ekodiAssistChat');if(!chat)return;chat.replaceChildren();const title=root.querySelector('#ekodiAssistTitle');if(title)title.textContent=activeThread?.thread?.title||'대화 · 문의';
    const composer=root.querySelector('#ekodiAssistComposer');if(composer)composer.hidden=true;
    if(activeThread){renderThread(chat,activeThread);return}
    const empty=el('div','ekodi-assist-welcome');empty.append(el('div','ekodi-assist-mark','E'),el('h2','','중요한 대화만 모았습니다.'),el('p','','왼쪽 목록에서 문의를 선택하면 답변·인수·완료 처리를 이어갈 수 있습니다.'));chat.append(empty);
  }
  async function openThread(id){try{activeThread=await api(`/api/control/messenger/threads/${id}`);railOpen=false;root.classList.remove('rail-open');renderInbox()}catch(error){showStatus(error.message,true)}}
  function renderThread(view,data){
    const thread=data.thread||{};const messages=el('div','ekodi-assist-command-thread');
    for(const message of data.messages||[]){const meta=message.metadata||{};const kind=meta.admin?'user':message.author_kind==='ai'?'assistant':message.author_kind==='human'&&String(message.author_user_id||'').startsWith('admin:')?'user':'assistant';const row=el('div',`ekodi-assist-turn ${kind}`);row.append(el('div','ekodi-assist-bubble',message.body||''));messages.append(row)}view.append(messages);
    const form=el('form','ekodi-assist-inbox-compose');const textarea=el('textarea');textarea.placeholder='사용자에게 직접 답변…';textarea.maxLength=8000;const send=el('button','ekodi-assist-send','↑');send.type='submit';form.append(textarea,send);form.addEventListener('submit',async event=>{event.preventDefault();const message=textarea.value.trim();if(!message)return;send.disabled=true;try{await api(`/api/control/messenger/threads/${thread.id}/reply`,{method:'POST',body:JSON.stringify({message,channel:'web'})});textarea.value='';await openThread(thread.id);await refreshSummary()}catch(error){showStatus(error.message,true)}finally{send.disabled=false}});view.append(form);
    const bar=el('div','ekodi-assist-actions');for(const [label,action] of [['직접 인수','takeover'],['AI에게 반환','release'],['대화 완료','close']]){const button=el('button','',label);button.type='button';button.addEventListener('click',()=>threadAction(thread.id,action));bar.append(button)}view.append(bar);scrollChat()
  }
  async function threadAction(id,action){try{await api(`/api/control/messenger/threads/${id}/${action}`,{method:'POST',body:'{}'});if(action==='close'){activeThread=null;await refreshSummary();renderInbox()}else await openThread(id)}catch(error){showStatus(error.message,true)}}
  function highRiskArea(text){return HIGH_RISK.find(item=>item.re.test(text))?.area||''}

  async function submitAi(text){
    if(!String(text||'').trim())return;
    state.tab='ai';setTab('ai',false);
    ensureSession(text);const history=aiHistory.slice(-8);rememberAi('user',text);addSessionMessage('user',text,{kind:'message',status:'active'});renderAi();showStatus('요청을 분류하고 안전 경계를 확인 중입니다.');
    const c=context();const risky=highRiskArea(text);
    try{
      let result;let queued=null;let reply='';let provider=null;let mode=null;let status='active';
      if(risky){
        result=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'admin.assist_request',area:risky,target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c,request:text},reversible:false,delegated:true,preflightVerified:false,reducesUserRights:risky==='policy_change_that_materially_reduces_user_rights'})});
        reply=`${statusLabel(result.status)} · 이 요청은 관리자 판단 경계에 두었습니다.`;status=result.status||'awaiting_human';lastAiReply=null;
      }else if(HEALTH_RE.test(text)){
        result=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c},reversible:true,delegated:true,preflightVerified:true})});
        reply=result.status==='verified'?'상태 점검을 완료했고 운영 기록에 남겼습니다.':`${statusLabel(result.status)} · 상태 점검 결과를 확인해 주세요.`;status=result.status||'active';lastAiReply=null;
      }else{
        if(ACTION_RE.test(text)){
          let preflight=false;try{const check=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:`Assist 사전점검: ${text}`,payload:{source:'admin-assist-dock',context:c},reversible:true,delegated:true,preflightVerified:true})});preflight=Boolean(check.ok)}catch{}
          queued=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'ui.change_request',area:'bounded_admin_change',target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c,request:text},reversible:true,delegated:true,preflightVerified:preflight})});
          status=queued.status||'active';
        }
        result=await api('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message:text,context:c,history})});
        reply=String(result.reply||'응답을 받지 못했습니다.');provider=result.provider||null;mode=result.mode||'free_assist';rememberAi('assistant',reply);lastAiReply={text:reply,mode,provider,notice:result.notice||''};
        if(queued)reply=`${reply}\n\n${statusLabel(queued.status)} · 운영 큐에 기록하고 Admin AI가 응답했습니다.`;
      }
      addSessionMessage('assistant',reply,{kind:risky||HEALTH_RE.test(text)||queued?'status':'message',status,provider,mode});
      const session=activeSession();if(session&&['verified','resolved'].includes(status))session.status='done';if(session&&status==='failed')session.status='failed';saveSessions();
      await refreshSummary();renderAi();
    }catch(error){
      addSessionMessage('assistant',error.message,{kind:'status',status:'failed'});const session=activeSession();if(session)session.status='failed';saveSessions();renderAi()
    }
  }

  function boot(){if(!document.querySelector('#app')||document.querySelector('#app')?.hidden)return;install()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('ekodi-authenticated',boot);
})();