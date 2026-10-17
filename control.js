(() => {
  'use strict';
  // Only apply the compact presentation when framed by the same-origin /admin page.
  // Authorization is still enforced by the existing Control APIs.
  if(window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='admin'){
    try{
      const parentLocation=window.parent.location;
      if(parentLocation.origin===location.origin&&/^\/admin(?:\/|$)/.test(parentLocation.pathname)){
        document.documentElement.dataset.ekodiControlEmbedded='admin';
        document.querySelectorAll('a[href="/admin/"]').forEach(link=>link.target='_top');
      }
    }catch{ /* Third-party framing is never a supported embedded presentation. */ }
  }

  const API='https://ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const HISTORY_KEY='ekodi-admin-command-history-v1';
  const CONTROL_STATE='ekodi-control-state-v1';
  const AGENTS=[
    ['ekodi','EKODI Core','orchestrator'],
    ['chatgpt','ChatGPT','AI'],
    ['genspark','Genspark','external agent'],
    ['gemini','Gemini','AI'],
    ['claude','Claude','AI'],
    ['qwen','Qwen','AI'],
  ];
  const WORKERS=[['cloud','Cloud Worker'],['browser','Browser Worker'],['local','Local Worker Pool']];
  const state={sessions:loadHistory(),activeId:null,view:'chat',busy:false,tasks:loadState().tasks||[],results:loadState().results||[]};
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const now=()=>new Date().toISOString();
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function loadHistory(){try{const v=JSON.parse(sessionStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(v)?v.slice(0,24):[]}catch{return[]}}
  function saveHistory(){try{sessionStorage.setItem(HISTORY_KEY,JSON.stringify(state.sessions.slice(0,24)))}catch{}}
  function loadState(){try{return JSON.parse(sessionStorage.getItem(CONTROL_STATE)||'{}')||{}}catch{return{}}}
  function saveState(){try{sessionStorage.setItem(CONTROL_STATE,JSON.stringify({tasks:state.tasks.slice(0,40),results:state.results.slice(0,40)}))}catch{}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function title(text){const v=String(text||'').replace(/\s+/g,' ').trim();return v.length>46?v.slice(0,46)+'…':v||'새 작업'}
  function statusLabel(v){return ({queued:'대기',running:'실행 중',verified:'완료',resolved:'완료',failed:'실패',blocked:'차단',core_only:'Core 처리',human_gate:'확인 필요',assigned:'배정됨',executing:'실행 중',production_verifying:'운영 검증 중',assist_only:'검토',ready_for_executor:'실행 대기',approved_pending_executor:'승인됨'})[v]||v||'진행'}
  function headers(json=false){const h={accept:'application/json'};if(token())h.authorization='Bearer '+token();if(json)h['content-type']='application/json';return h}
  async function api(path,options={}){
    const response=await fetch(API+path,{cache:'no-store',...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(response.status===401||response.status===403)throw Object.assign(new Error('최고관리자 로그인이 필요합니다.'),{auth:true,status:response.status});
    if(!response.ok)throw new Error(data.error||data.message||('요청 실패 ('+response.status+')'));
    return data;
  }
  function toast(message){const node=$('#toast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,2400)}
  function ensureSession(firstText=''){
    let s=state.sessions.find(x=>x.id===state.activeId);
    if(s)return s;
    s={id:'control-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),title:title(firstText),createdAt:now(),updatedAt:now(),status:'active',messages:[]};
    state.sessions.unshift(s);state.activeId=s.id;saveHistory();return s;
  }
  function pushMessage(role,text,extra={}){
    const s=ensureSession(text);s.messages=s.messages||[];s.messages.push({role,text:String(text||'').slice(0,12000),at:now(),...extra});s.updatedAt=now();if(extra.status)s.status=extra.status;
    state.sessions=[s,...state.sessions.filter(x=>x.id!==s.id)].slice(0,24);saveHistory();renderRecent();renderMessages({scrollToEnd:true});renderWorkspaceSummary();
  }
  function setView(view){state.view=view;$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));$$('[data-view-panel]').forEach(n=>n.classList.toggle('active',n.dataset.viewPanel===view));if(view!=='chat')renderPanels();closeRail()}
  function renderWorkspaceSummary(){
    const node=$('#workspaceCounts');
    if(!node)return;
    const blocked=state.tasks.filter(t=>t.status==='blocked'||t.status==='human_gate').length;
    node.textContent='이 브라우저 대화 '+state.sessions.length+'건 · 작업 '+state.tasks.length+'건'+(blocked?' · 차단 기록 '+blocked+'건':'');
    node.title='저장된 기록입니다. 작업 상태 확인에서 새로고침하면 공식 상태를 확인할 수 있습니다.';
  }
  function updateExecutionMode(){
    const node=$('#executionModeDescription');
    if(!node)return;
    if($('#orchestratorRelease')?.checked){
      node.textContent='보호 배포 접수: 즉시 배포하지 않고 공식 오케스트레이터의 승인 절차로 보냅니다.';
    }else if($('#executeNow')?.checked){
      node.textContent='일반 실행: EKODI 작업 접수와 응답을 요청합니다. AI 경로 점검은 미리보기만 합니다.';
    }else{
      node.textContent='응답만 요청: 새로운 실행 작업은 접수하지 않습니다. AI 경로 점검은 미리보기만 합니다.';
    }
  }
  function renderRecent(){const root=$('#recentTasks');const items=state.sessions.slice(0,14);root.innerHTML=items.length?items.map(s=>'<button type="button" class="recent-item" data-session="'+esc(s.id)+'">'+esc(s.title||'새 작업')+'</button>').join(''):'<div class="section-title">아직 작업이 없습니다.</div>';root.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{state.activeId=b.dataset.session;setView('chat');renderMessages({scrollToEnd:true})})}
  function renderMessages({scrollToEnd=false}={}){const s=state.sessions.find(x=>x.id===state.activeId);const messages=s?.messages||[];$('#emptyState').hidden=messages.length>0;$('#messages').innerHTML=messages.map(m=>{
    const meta=[m.provider,m.target,m.status&&statusLabel(m.status)].filter(Boolean).join(' · ');
    const task=m.taskId?'<div class="execution-card"><strong>EKODI Task '+esc(m.taskId)+'</strong><span>'+esc(statusLabel(m.status))+'</span></div>':'';
    return '<article class="turn '+esc(m.role)+'"><div class="meta">'+esc(m.role==='user'?'사용자':'EKODI')+(meta?' · '+esc(meta):'')+'</div><div class="bubble">'+esc(m.text)+'</div>'+task+'</article>';
  }).join('');
    // Do not animate the window on initial load or during a background update.
    // Message history has its own bounded scroll surface, separate from the fixed composer.
    if(scrollToEnd && messages.length && state.view==='chat'){
      requestAnimationFrame(()=>{const panel=$('#conversation');if(panel && state.view==='chat')panel.scrollTop=panel.scrollHeight});
    }
  }
  function historyForAssist(){const s=state.sessions.find(x=>x.id===state.activeId);return (s?.messages||[]).filter(m=>m.role==='user'||m.role==='assistant').slice(-8).map(m=>({role:m.role,text:m.text}))}
  async function previewAiRoute(){
    const goal=String($('#commandInput')?.value||'').trim();
    if(!goal){toast('먼저 점검할 명령을 입력해 주세요.');return}
    if(state.busy)return;
    state.busy=true;$('#sendButton').disabled=true;
    try{
      const result=await api('/api/control/ai/v8/sovereignty/preview',{
        method:'POST',
        body:JSON.stringify({goal,risk:'normal',sensitive:false})
      });
      if(result?.previewOnly!==true || result?.executionAuthorized!==false){
        throw new Error('안전한 미리보기 결과를 확인하지 못했습니다.');
      }
      const route=result.decision?.path==='provider'
        ?'AI 후보: '+String(result.decision.providerId||'확인 필요')
        :result.decision?.path==='ekodi-capability'
          ?'EKODI 자체 기능 후보: '+String(result.decision.capabilityId||'확인 필요')
          :'현재 승인된 실행 경로가 없습니다.';
      const matches=(Array.isArray(result.reusableSuggestions)?result.reusableSuggestions:[])
        .slice(0,5).map(item=>String(item.name||item.id||'')).filter(Boolean);
      const checked=(Array.isArray(result.connections)?result.connections:[])
        .filter(item=>item.connected===true).map(item=>item.id);
      const vault=result.credentialVault?.configured===true?'개인별 암호화 금고 설정됨':'개인별 암호화 금고 설정 미확인';
      const reply='AI 실행 경로 사전 점검 (실행되지 않음)\\n'+route+
        '\\n관련 자체서비스: '+(matches.join(', ')||'검색 결과 없음')+
        '\\n건강검사 확인된 AI: '+(checked.join(', ')||'없음')+
        '\\n'+vault+
        '\\n실제 실행은 EKODI 권한·검증·비용 정책에 따라 별도로 진행됩니다.';
      pushMessage('assistant',reply,{provider:'EKODI 사전 점검',status:'assist_only'});
    }catch(error){pushMessage('assistant',String(error.message||'미리보기 실패'),{status:'failed'});}
    finally{state.busy=false;$('#sendButton').disabled=false}
  }
  async function submitCommand(value){
    if(state.busy)return;const message=String(value||'').trim();if(!message)return;
    state.busy=true;$('#sendButton').disabled=true;const target=$('#executionTarget').value;const executeNow=$('#executeNow').checked;const releaseMode=$('#orchestratorRelease')?.checked===true;
    const prior=historyForAssist();pushMessage('user',message,{target});$('#commandInput').value='';resizeInput();
    let queued=null;
    try{
      if(releaseMode){
        // Stable per conversation/message to prevent duplicate task creation on retries.
        const bytes=new TextEncoder().encode(String(state.activeId||'session')+'\\0'+message);
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        const idempotencyKey='control-'+Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
        const submitted=await api('/api/control/ai/v8/orchestrator/submit',{method:'POST',body:JSON.stringify({
          intent:message,risk:'high',deploymentRequested:true,idempotencyKey,service:'control'
        })});
        if(submitted?.accepted!==true || submitted?.deploymentAuthorized===true){
          throw new Error('공식 오케스트레이터 접수 상태를 검증하지 못했습니다.');
        }
        const taskId=String(submitted.taskId||'');
        const taskStatus=String(submitted.state||'queued');
        // This opt-in applies to one submitted command only.
        if($('#orchestratorRelease'))$('#orchestratorRelease').checked=false;updateExecutionMode();
        const humanGateNotice=taskStatus==='blocked' && submitted.humanGate?.required===true
          ?'\n현재 차단 사유: Human Gate 승인 대기. 최고관리자 권한으로 해당 작업의 승인 상태를 확인해야 합니다. 승인 없이 배포하지 않습니다.'
          :taskStatus==='blocked'?'\n현재 차단 사유는 작업 상세에서 확인해야 합니다. 임의 승인이나 자동 재시도는 하지 않습니다.':'';
        const reply='EKODI 공식 오케스트레이터 작업 접수: '+taskId+
          '\n작업 브랜치: '+String(submitted.branchRef||'없음')+
          '\n현재 상태: '+statusLabel(taskStatus)+
          '\n보호된 승인·CI·스테이징·운영 검증이 끝나기 전에는 배포 완료가 아닙니다.'+humanGateNotice;
        state.tasks.unshift({id:taskId,title:title(message),status:taskStatus,target:'EKODI Orchestrator',at:now()});
        state.tasks=state.tasks.slice(0,40);
        state.results.unshift({title:title(message),summary:reply,provider:'EKODI Orchestrator',taskId,status:taskStatus,at:now()});
        state.results=state.results.slice(0,40);saveState();
        pushMessage('assistant',reply,{provider:'EKODI Orchestrator',target:'ekodi',status:taskStatus,taskId});
        renderPanels();
        return;
      }
      if(executeNow){
        queued=await api('/api/control/ai/v8/pulse',{method:'POST',body:JSON.stringify({
          goal:message,risk:'normal',
          target:{capability:'core.automation',service:'control',section:'command',surface:'control',providerHint:target},
          delegation:{allowed:true,reversible:true,audited:true,preflightVerified:false,verificationDefined:true},
          context:{source:'control-surface',pathname:location.pathname,executionTarget:target,request:message},
          event:{kind:'control_command',source:'control-surface',summary:message,changeClass:'yellow',actionable:true,requiresHumanDecision:false},
          executeNow:true
        })});
      }
      const taskId=queued?.task?.id||queued?.execution?.results?.[0]?.taskId||'';
      const taskStatus=queued?.task?.state||queued?.execution?.results?.[0]?.state||(executeNow?'queued':'assist_only');
      if(taskId){state.tasks.unshift({id:taskId,title:title(message),status:taskStatus,target,at:now()});state.tasks=state.tasks.slice(0,40);saveState()}
      const result=await api('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message,history:prior,context:{source:'control-surface',pathname:location.pathname,executionTarget:target,taskId}})});
      const reply=String(result.reply||'응답을 받지 못했습니다.');
      pushMessage('assistant',reply,{provider:result.provider||'EKODI',target,status:taskStatus,taskId});
      state.results.unshift({title:title(message),summary:reply.slice(0,280),provider:result.provider||'EKODI',taskId,status:taskStatus,at:now()});state.results=state.results.slice(0,40);saveState();renderPanels();
    }catch(error){
      pushMessage('assistant',error.message,{status:'failed',target});
      if(error.auth)toast('최고관리자 로그인 후 /admin/control로 돌아오세요.');
    }finally{state.busy=false;$('#sendButton').disabled=false;$('#commandInput').focus({preventScroll:true})}
  }
  function card(titleText,status,description){return '<article class="card"><div class="card-head"><strong>'+esc(titleText)+'</strong><span class="badge">'+esc(status)+'</span></div><p>'+esc(description||'')+'</p></article>'}
  function renderPanels(){
    renderWorkspaceSummary();
    $('#taskCards').innerHTML=state.tasks.length?state.tasks.map(t=>card(t.title,statusLabel(t.status),(t.id||'')+' · '+(t.target||'auto'))).join(''):card('아직 실행 작업이 없습니다','대기','대화에서 실행을 시작하면 Task가 표시됩니다.');
    $('#agentCards').innerHTML=AGENTS.map(([id,name,kind])=>card(name,id==='ekodi'?'최종 통제':'연결 대상',kind+' · EKODI 라우팅/권한 정책 적용')).join('');
    $('#workerCards').innerHTML=WORKERS.map(([id,name])=>card(name,'상태는 실행 시 확인',id+' 실행계층')).join('');
    $('#resultCards').innerHTML=state.results.length?state.results.map(r=>card(r.title,statusLabel(r.status),(r.provider||'EKODI')+(r.taskId?' · '+r.taskId:'')+'\n'+r.summary)).join(''):card('아직 결과가 없습니다','대기','명령 처리 후 검증된 결과가 이곳에 누적됩니다.');
  }
  async function refreshOrchestratorTasks(){
    const recent=state.tasks.filter(item=>item.target==='EKODI Orchestrator' && /^orch_[a-z0-9_-]{16,}$/i.test(item.id||'')).slice(0,10);
    let updated=0,unavailable=0;
    for(const row of recent){
      try{
        const response=await api('/api/control/ai/v8/orchestrator/tasks/'+encodeURIComponent(row.id));
        const task=response?.task;
        if(!task||task.taskId!==row.id)continue;
        row.status=String(task.state||row.status);
        row.at=now();
        // A task state is NOT equivalent to independently verified production delivery.
        row.productionEvidencePresent=Boolean(task.productionEvidence);
        const result=state.results.find(item=>item.taskId===row.id);
        if(result){
          result.status=row.status;
          result.summary='오케스트레이터 상태: '+statusLabel(row.status)+
            ' · 운영 증빙: '+(row.productionEvidencePresent?'수신됨 (검증 별도)':'미확인');
        }
        updated++;
      }catch{unavailable++}
    }
    saveState();renderPanels();
    toast('오케스트레이터 상태 '+updated+'건 갱신'+(unavailable?' · '+unavailable+'건 조회 실패':''));
  }
  // The administrator sidebar already owns global navigation. Reuse Control's
  // existing buttons in a compact top strip rather than rendering a second rail.
  // Standalone /control keeps its complete original sidebar and history.
  function mountEmbeddedToolbar(){
    if(document.documentElement.dataset.ekodiControlEmbedded!=='admin')return;
    if($('#controlEmbeddedToolbar'))return;
    const rail=$('#controlRail');
    const top=$('.control-main .topbar');
    const nav=rail?.querySelector('.rail-nav');
    const create=$('#newTask');
    const recent=rail?.querySelector('.recent');
    if(!rail||!top||!nav||!create||!recent)return;
    const strip=document.createElement('div');
    strip.id='controlEmbeddedToolbar';
    strip.className='control-embedded-toolbar';
    strip.setAttribute('role','group');
    strip.setAttribute('aria-label','EKODI Control 작업 메뉴');
    const history=document.createElement('details');
    history.className='control-embedded-history';
    const summary=document.createElement('summary');
    summary.textContent='최근 작업';
    history.append(summary,recent);
    strip.append(create,nav,history);
    top.after(strip);
    rail.hidden=true;
  }
  function resizeInput(){
    const input=$('#commandInput');
    input.style.height='auto';
    const nextHeight=Math.min(input.scrollHeight,160);
    input.style.height=nextHeight+'px';
    input.style.overflowY=input.scrollHeight>160?'auto':'hidden';
  }
  function newTask(){state.activeId=null;setView('chat');renderMessages();$('#conversation').scrollTop=0;$('#commandInput').focus({preventScroll:true})}
  function closeRail(){$('#controlRail').classList.remove('open')}
  function bind(){
    $$('.nav-item').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#newTask').onclick=newTask;$('#railOpen').onclick=()=>$('#controlRail').classList.add('open');$('#railClose').onclick=closeRail;
    $('#openTaskList').onclick=()=>setView('tasks');
    $('#executeNow').addEventListener('change',updateExecutionMode);
    $('#orchestratorRelease').addEventListener('change',updateExecutionMode);
    updateExecutionMode();
    $('#commandForm').addEventListener('submit',e=>{e.preventDefault();submitCommand($('#commandInput').value)});
    $('#aiRoutePreview').addEventListener('click',()=>previewAiRoute());
    $('#commandInput').addEventListener('input',resizeInput);
    $('#commandInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#commandForm').requestSubmit()}});
    $$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#commandInput').value=b.dataset.prompt;resizeInput();$('#commandInput').focus({preventScroll:true})});
    $$('[data-refresh]').forEach(b=>b.onclick=()=>{refreshOrchestratorTasks().catch(()=>toast('오케스트레이터 상태 갱신 실패'))});
  }
  async function acceptVerifiedAdminControlHandoff(){
    // Google Admin returns to the exact Control deep-link with an ephemeral
    // hash token. Remove the token from the visible URL before any network I/O.
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    const candidate=hash.get('ekodi_admin_token');
    if(!candidate)return false;
    try{history.replaceState(history.state,document.title,location.pathname+location.search)}catch{}
    if(candidate.length>8192)return false;
    try{
      const response=await fetch(API+'/api/session',{
        headers:{authorization:'Bearer '+candidate},
        credentials:'same-origin',cache:'no-store'
      });
      if(!response.ok)return false;
      const session=await response.json();
      if(session?.authenticated!==true||session.role!=='super_admin')return false;
      sessionStorage.setItem(TOKEN_KEY,candidate);
      return token()===candidate;
    }catch{return false;}
  }
  function renderAdminControlLogin(logged){
    const status=$('#authState');
    if(!status)return;
    if(logged){status.textContent='최고관리자 세션';return;}
    // Identity is established by the existing Google Admin center. Never skip
    // its server-side allowlist or change the control API authorization.
    const auth=new URL('/auth/',API);
    auth.searchParams.set('site','admin');
    auth.searchParams.set('direct','1');
    auth.searchParams.set('return_to','https://ekodi.kr/admin/control');
    const link=document.createElement('a');
    link.href=auth.toString();
    link.textContent='관리자 Google 로그인';
    link.setAttribute('aria-label','최고관리자 Google 로그인 후 EKODI Control로 복귀');
    status.replaceChildren(link);
  }
  async function boot(){
    await acceptVerifiedAdminControlHandoff();
    mountEmbeddedToolbar();
    bind();renderRecent();renderMessages();renderPanels();
    const logged=Boolean(token());renderAdminControlLogin(logged);$('#runtimeStatus').textContent=logged?'EKODI 연결 준비':'로그인 필요';$('#runtimeStatus').classList.toggle('ok',logged);
    if(!logged)toast('최고관리자 로그인 세션이 필요합니다.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();