(() => {
  'use strict';
  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const STATE_KEY='ekodi-assist-state-v1';
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
  let state=loadState();
  let root=null;

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function headers(json=false){const h=token()?{authorization:`Bearer ${token()}`}:{ };if(json)h['content-type']='application/json';return h}
  function loadState(){try{return {...{open:false,tab:'inbox'},...JSON.parse(sessionStorage.getItem(STATE_KEY)||'{}')}}catch{return{open:false,tab:'inbox'}}}
  function saveState(){try{sessionStorage.setItem(STATE_KEY,JSON.stringify({open:state.open,tab:state.tab}))}catch{}}
  function esc(text){return String(text??'')}
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
  function priorityLabel(value){if(value==='urgent')return'긴급';if(value==='review')return'확인 필요';return'일반'}
  function statusLabel(value){const map={waiting_human:'담당자 확인 대기',open:'AI 응답',resolved:'완료',archived:'보관',accepted:'담당자 응답 중',requested:'연결 대기',awaiting_human:'승인 대기',verified:'완료',ready_for_executor:'실행 대기',assist_only:'검토',blocked:'차단',failed:'실패',approved_pending_executor:'승인됨'};return map[value]||value||'확인'}

  function install(){
    if(document.querySelector('#ekodiAssistDock')||!token())return;
    root=el('div','ekodi-assist');root.id='ekodiAssistDock';
    root.innerHTML='<button type="button" class="ekodi-assist-launcher" id="ekodiAssistLauncher" aria-label="EKODI Assist 열기" aria-expanded="false">✦<span class="ekodi-assist-badge" id="ekodiAssistBadge" hidden></span></button><section class="ekodi-assist-panel" id="ekodiAssistPanel" hidden aria-label="EKODI Assist"><header class="ekodi-assist-head"><div class="ekodi-assist-mark">E</div><div class="ekodi-assist-title"><strong>EKODI Assist</strong><small id="ekodiAssistContext">현재 화면을 확인 중입니다.</small></div><button type="button" class="ekodi-assist-close" id="ekodiAssistClose" aria-label="닫기">×</button></header><div class="ekodi-assist-tabs" role="tablist"><button type="button" class="ekodi-assist-tab" data-assist-tab="inbox">대화 · 문의</button><button type="button" class="ekodi-assist-tab" data-assist-tab="ai">AI OPS</button></div><div class="ekodi-assist-view" id="ekodiAssistInbox"></div><div class="ekodi-assist-view" id="ekodiAssistAi" hidden></div><footer class="ekodi-assist-footer"><span>중요한 것만 표시합니다.</span><a href="https://api.ekodi.kr/operator" target="_blank" rel="noopener">전체 화면 ↗</a></footer></section>';
    document.body.appendChild(root);
    root.querySelector('#ekodiAssistLauncher').addEventListener('click',()=>setOpen(!state.open));
    root.querySelector('#ekodiAssistClose').addEventListener('click',()=>setOpen(false));
    root.querySelectorAll('[data-assist-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.assistTab)));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open)setOpen(false)});
    window.addEventListener('ekodi-nav-changed',updateContext);
    window.addEventListener('hashchange',updateContext);
    window.addEventListener('ekodi-admin-capability-requested',event=>{const capability=event.detail?.capability;if(!capability)return;setOpen(true);setTab('ai');submitAi(`${capability.name} (${capability.id}) Capability를 현재 관리자 화면 맥락에서 사용해줘. ${capability.description||''}`)});
    window.addEventListener('focus',()=>{if(document.visibilityState==='visible')refreshSummary()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSummary()});
    setTab(state.tab,false);setOpen(Boolean(state.open),false);updateContext();refreshSummary();
  }
  function updateContext(){if(!root)return;const c=context();const node=root.querySelector('#ekodiAssistContext');if(node)node.textContent=`현재: ${c.title}`;if(state.tab==='ai')renderAi()}
  function setOpen(open,persist=true){state.open=Boolean(open);const panel=root?.querySelector('#ekodiAssistPanel');const launcher=root?.querySelector('#ekodiAssistLauncher');if(panel)panel.hidden=!state.open;if(launcher)launcher.setAttribute('aria-expanded',String(state.open));if(persist)saveState();if(state.open){updateContext();refreshSummary();state.tab==='inbox'?renderInbox():renderAi()}}
  function setTab(tab,persist=true){state.tab=tab==='ai'?'ai':'inbox';root?.querySelectorAll('[data-assist-tab]').forEach(button=>button.classList.toggle('active',button.dataset.assistTab===state.tab));const inView=root?.querySelector('#ekodiAssistInbox');const aiView=root?.querySelector('#ekodiAssistAi');if(inView)inView.hidden=state.tab!=='inbox';if(aiView)aiView.hidden=state.tab!=='ai';if(persist)saveState();state.tab==='inbox'?renderInbox():renderAi()}
  function updateBadge(){const inquiry=inbox.filter(item=>item.status==='waiting_human'||['requested','accepted'].includes(item.handoffStatus)).length;const approvals=actions.filter(item=>item.status==='awaiting_human').length;const total=inquiry+approvals;const badge=root?.querySelector('#ekodiAssistBadge');if(!badge)return;badge.hidden=total===0;badge.textContent=total>99?'99+':String(total);badge.setAttribute('aria-label',`관리자 확인 필요 ${total}건`)}
  async function refreshSummary(){if(!token())return;try{const [inboxData,actionData]=await Promise.all([api('/api/control/messenger/inbox'),api('/api/control/ai/actions?limit=20')]);inbox=Array.isArray(inboxData.inbox)?inboxData.inbox:[];actions=Array.isArray(actionData.actions)?actionData.actions:[];updateBadge();if(state.open){renderInbox();renderAi()}}catch(error){if(state.open)showStatus(state.tab,error.message,true)}}
  function showStatus(tab,message,error=false){const view=root?.querySelector(tab==='ai'?'#ekodiAssistAi':'#ekodiAssistInbox');if(!view)return;let node=view.querySelector('.ekodi-assist-status');if(!node){node=el('div','ekodi-assist-status');view.prepend(node)}node.textContent=message;node.classList.toggle('error',error)}

  function renderInbox(){
    const view=root?.querySelector('#ekodiAssistInbox');if(!view)return;view.replaceChildren();
    if(activeThread){renderThread(view,activeThread);return}
    const summary=el('div','ekodi-assist-summary');const copy=el('div');copy.append(el('strong','',`관리자 확인 ${inbox.length}건`),el('span','',inbox.length?'AI가 넘긴 중요한 대화만 모았습니다.':'지금 바로 확인할 대화가 없습니다.'));const refresh=el('button','ekodi-assist-iconbtn','↻ 새로고침');refresh.type='button';refresh.addEventListener('click',refreshSummary);summary.append(copy,refresh);view.append(summary);
    if(!inbox.length){view.append(el('div','ekodi-assist-empty','새 문의가 생기면 여기에만 표시됩니다. 일반 대화 수는 배지에 쌓지 않습니다.'));return}
    const list=el('div','ekodi-assist-list');for(const item of inbox){const button=el('button','ekodi-assist-item');button.type='button';const top=el('div','ekodi-assist-item-top');const priority=el('span',`ekodi-assist-priority ${item.priority||'normal'}`,priorityLabel(item.priority));top.append(priority,el('b','',item.title||`대화 #${item.id}`));button.append(top,el('p','',item.lastMessage||statusLabel(item.handoffStatus||item.status)));button.addEventListener('click',()=>openThread(item.id));list.append(button)}view.append(list)
  }
  async function openThread(id){const view=root?.querySelector('#ekodiAssistInbox');if(view){view.replaceChildren(el('div','ekodi-assist-empty','대화를 불러오는 중입니다.'))}try{activeThread=await api(`/api/control/messenger/threads/${id}`);renderInbox()}catch(error){activeThread=null;renderInbox();showStatus('inbox',error.message,true)}}
  function renderThread(view,data){
    const thread=data.thread||{};const head=el('div','ekodi-assist-detail-head');const back=el('button','ekodi-assist-iconbtn','← 목록');back.type='button';back.addEventListener('click',()=>{activeThread=null;renderInbox()});head.append(back,el('strong','',thread.title||`대화 #${thread.id}`));view.append(head);
    const messages=el('div','ekodi-assist-messages');for(const message of data.messages||[]){const meta=message.metadata||{};const kind=meta.admin?'admin':message.author_kind==='ai'?'ai':message.author_kind==='human'&&String(message.author_user_id||'').startsWith('admin:')?'admin':'';messages.append(el('div',`ekodi-assist-message ${kind}`,message.body||''))}view.append(messages);
    const form=el('form','ekodi-assist-compose');const textarea=el('textarea');textarea.placeholder='사용자에게 직접 답변…';textarea.maxLength=8000;const send=el('button','ekodi-assist-primary','답변');send.type='submit';form.append(textarea,send);form.addEventListener('submit',async event=>{event.preventDefault();const message=textarea.value.trim();if(!message)return;send.disabled=true;try{await api(`/api/control/messenger/threads/${thread.id}/reply`,{method:'POST',body:JSON.stringify({message,channel:'web'})});textarea.value='';await openThread(thread.id);await refreshSummary()}catch(error){showStatus('inbox',error.message,true)}finally{send.disabled=false}});view.append(form);
    const actionsBar=el('div','ekodi-assist-actions');const take=el('button','', '직접 인수');take.type='button';take.addEventListener('click',()=>threadAction(thread.id,'takeover'));const release=el('button','', 'AI에게 반환');release.type='button';release.addEventListener('click',()=>threadAction(thread.id,'release'));const close=el('button','', '대화 완료');close.type='button';close.addEventListener('click',()=>threadAction(thread.id,'close'));const full=el('a','', '전체 화면 ↗');full.href='https://api.ekodi.kr/operator';full.target='_blank';full.rel='noopener';actionsBar.append(take,release,close,full);view.append(actionsBar)
  }
  async function threadAction(id,action){try{await api(`/api/control/messenger/threads/${id}/${action}`,{method:'POST',body:'{}'});if(action==='close'){activeThread=null;await refreshSummary()}else await openThread(id)}catch(error){showStatus('inbox',error.message,true)}}

  function renderAi(){
    const view=root?.querySelector('#ekodiAssistAi');if(!view)return;view.replaceChildren();const c=context();const intro=el('div','ekodi-assist-ai-intro');intro.append(el('strong','',`${c.title}에서 무엇을 할까요?`),el('p','','현재 관리자 화면의 맥락을 함께 보내며, 삭제·권한·금전·계약 같은 고위험 요청은 자동 실행하지 않습니다.'));view.append(intro);
    const quick=el('div','ekodi-assist-quick');[['현재 화면 상태 점검','health'],['승인 대기 보기','approvals'],['전체 AI OPS 열기','full']].forEach(([label,kind])=>{const button=el('button','',label);button.type='button';button.addEventListener('click',()=>{if(kind==='health')submitAi('현재 화면과 관련 서비스 상태를 점검해줘');else if(kind==='approvals')renderAiActions(view,true);else location.hash='#ai-ops'});quick.append(button)});view.append(quick);
    const form=el('form');const input=el('textarea','ekodi-assist-command');input.rows=3;input.maxLength=1800;input.placeholder='질문하거나 운영 요청을 말씀해 주세요. 예: 이 화면에서 지금 중요한 것은 뭐야?';const submit=el('button','ekodi-assist-primary','요청 보내기');submit.type='submit';submit.style.height='34px';submit.style.marginTop='7px';form.append(input,submit);form.addEventListener('submit',event=>{event.preventDefault();const text=input.value.trim();if(text){input.value='';submitAi(text)}});view.append(form);
    if(lastAiReply){const reply=el('div','ekodi-assist-ai-intro');const label=lastAiReply.mode==='ai'?'EKODI Admin AI':'EKODI Assist 기본 모드';const body=el('p','',lastAiReply.text);body.style.whiteSpace='pre-wrap';reply.append(el('strong','',label),body);if(lastAiReply.notice){const notice=el('p','',lastAiReply.notice);notice.style.opacity='.8';reply.append(notice)}view.append(reply)}
    renderAiActions(view,false)
  }
  function renderAiActions(view,onlyApprovals){
    let container=view.querySelector('.ekodi-assist-ai-result');if(container)container.remove();container=el('div','ekodi-assist-ai-result');const rows=(onlyApprovals?actions.filter(item=>item.status==='awaiting_human'):actions).slice(0,5);if(!rows.length){container.append(el('div','ekodi-assist-empty',onlyApprovals?'현재 사람 승인을 기다리는 작업이 없습니다.':'최근 AI 운영 요청이 없습니다.'))}else{for(const item of rows){const row=el('div','ekodi-assist-actionrow');row.append(el('b','',`${statusLabel(item.status)} · ${item.agent_name||item.agent_id||'AI'}`),el('span','',item.rationale||item.action_type||''));container.append(row)}}view.append(container)
  }
  function highRiskArea(text){return HIGH_RISK.find(item=>item.re.test(text))?.area||''}
  async function submitAi(text){
    const view=root?.querySelector('#ekodiAssistAi');if(!view)return;const status=el('div','ekodi-assist-status','요청을 분류하고 안전 경계를 확인 중입니다.');view.prepend(status);const c=context();const risky=highRiskArea(text);
    try{
      let result;
      let queued=null;
      if(risky){result=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'admin.assist_request',area:risky,target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c,request:text},reversible:false,delegated:true,preflightVerified:false,reducesUserRights:risky==='policy_change_that_materially_reduces_user_rights'})});lastAiReply=null;status.textContent=`${statusLabel(result.status)} · 이 요청은 관리자 판단 경계에 두었습니다.`}
      else if(HEALTH_RE.test(text)){result=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c},reversible:true,delegated:true,preflightVerified:true})});lastAiReply=null;status.textContent=result.status==='verified'?'상태 점검 완료 · 운영 기록에 남겼습니다.':`${statusLabel(result.status)} · 상태 점검 결과를 확인해 주세요.`}
      else{
        if(ACTION_RE.test(text)){
          let preflight=false;try{const check=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:`Assist 사전점검: ${text}`,payload:{source:'admin-assist-dock',context:c},reversible:true,delegated:true,preflightVerified:true})});preflight=Boolean(check.ok)}catch{}
          queued=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'ui.change_request',area:'bounded_admin_change',target:c.section,rationale:text,payload:{source:'admin-assist-dock',context:c,request:text},reversible:true,delegated:true,preflightVerified:preflight})})
        }
        const history=aiHistory.slice(-8);rememberAi('user',text);
        result=await api('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message:text,context:c,history})});
        const reply=String(result.reply||'응답을 받지 못했습니다.');rememberAi('assistant',reply);lastAiReply={text:reply,mode:result.mode||'free_assist',provider:result.provider||null,notice:result.notice||''};
        status.textContent=queued?`${statusLabel(queued.status)} · 운영 큐에 기록하고 Admin AI가 응답했습니다.`:(result.mode==='ai'?'EKODI Admin AI가 응답했습니다.':'기본 보조 모드로 응답했습니다.')
      }
      await refreshSummary();renderAi();const latest=root?.querySelector('#ekodiAssistAi');if(latest){const note=el('div','ekodi-assist-status',status.textContent);latest.prepend(note)}
    }catch(error){status.textContent=error.message;status.classList.add('error')}
  }

  function boot(){if(!document.querySelector('#app')||document.querySelector('#app')?.hidden)return;install()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('ekodi-authenticated',boot);
})();
