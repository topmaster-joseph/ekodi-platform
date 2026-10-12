(() => {
  'use strict';
  const API='https://ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const HISTORY_KEY='ekodi-admin-command-history-v2';
  const CONTROL_STATE='ekodi-control-state-v2';
  // Only a same-origin administrator iframe requests this presentation mode.
  // Authentication and authority checks still execute on the server.
  if(new URLSearchParams(location.search).get('embed')==='admin'){
    document.documentElement.dataset.controlEmbed='admin';
  }
  const AGENTS=[
    ['ekodi','EKODI Core','orchestrator'],
    ['chatgpt','ChatGPT','AI'],
    ['genspark','Genspark','external agent'],
    ['gemini','Gemini','AI'],
    ['claude','Claude','AI'],
    ['qwen','Qwen','AI'],
  ];
  const WORKERS=[['cloud','Cloud Worker'],['browser','Browser Worker'],['local','Local Worker Pool']];
  const state={sessions:[],activeId:null,view:'chat',busy:false,authenticated:false,authPromise:null,storageOwner:'',authEpoch:0,taskRequestId:0,tasks:[],results:[],liveTasks:[],taskSource:'local',taskCheckedAt:'',taskRefreshing:false,taskNotice:''};
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const now=()=>new Date().toISOString();
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  // Never hydrate a previous operator's browser history before the server
  // confirms the signed-in administrator. Legacy unscoped v1 data is not
  // migrated across accounts because it has no verified owner.
  function scopedKey(base){return state.storageOwner?base+':'+encodeURIComponent(state.storageOwner):''}
  function loadHistory(){try{const key=scopedKey(HISTORY_KEY);if(!key)return[];const v=JSON.parse(sessionStorage.getItem(key)||'[]');return Array.isArray(v)?v.slice(0,24):[]}catch{return[]}}
  function saveHistory(){try{const key=scopedKey(HISTORY_KEY);if(key)sessionStorage.setItem(key,JSON.stringify(state.sessions.slice(0,24)))}catch{}}
  function loadState(){try{const key=scopedKey(CONTROL_STATE);return key?(JSON.parse(sessionStorage.getItem(key)||'{}')||{}):{}}catch{return{}}}
  function saveState(){try{const key=scopedKey(CONTROL_STATE);if(key)sessionStorage.setItem(key,JSON.stringify({tasks:state.tasks.slice(0,40),results:state.results.slice(0,40)}))}catch{}}
  function resetPrivateSurface(){
    const hadPrivateData=Boolean(state.storageOwner||state.sessions.length||state.activeId||
      state.tasks.length||state.results.length||state.liveTasks.length||state.taskRefreshing||state.taskSource!=='local');
    state.authEpoch++;state.taskRequestId++;state.taskRefreshing=false;
    state.storageOwner='';state.sessions=[];state.activeId=null;state.tasks=[];state.results=[];
    state.liveTasks=[];state.taskSource='local';state.taskCheckedAt='';state.taskNotice='';
    if(hadPrivateData){renderRecent();renderMessages();renderPanels()}
  }
  function bindAccount(session){
    const email=String(session?.email||'').trim().toLowerCase();
    if(!email)return false;
    if(state.storageOwner!==email){
      state.authEpoch++;state.taskRequestId++;state.taskRefreshing=false;
      state.storageOwner=email;state.sessions=loadHistory();state.activeId=state.sessions[0]?.id||null;
      const cached=loadState();
      state.tasks=Array.isArray(cached.tasks)?cached.tasks.slice(0,40):[];
      state.results=Array.isArray(cached.results)?cached.results.slice(0,40):[];
      state.liveTasks=[];state.taskSource='local';state.taskCheckedAt='';state.taskNotice='';
      renderRecent();renderMessages();renderPanels();
    }
    return true;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function title(text){const v=String(text||'').replace(/\s+/g,' ').trim();return v.length>46?v.slice(0,46)+'…':v||'새 작업'}
  function statusLabel(v){return ({queued:'대기',running:'실행 중',verified:'완료',resolved:'완료',failed:'실패',blocked:'차단',auto_blocked:'승인·사전점검 필요',preflight_failed:'사전점검 실패',core_only:'Core 처리 · 실행 증빙 대기',human_gate:'관리자 승인 대기',assist_only:'AI 설명',ready_for_executor:'실행 대기',approved_pending_executor:'승인 후 실행 대기',retry:'재시도 대기',degraded:'부분 처리 · 확인 필요',executor_ready:'실행기 인계 대기',ignored:'처리 제외'})[v]||v||'진행'}
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
    state.sessions=[s,...state.sessions.filter(x=>x.id!==s.id)].slice(0,24);saveHistory();renderRecent();renderMessages();
  }
  function setView(view){state.view=view;$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));$$('[data-view-panel]').forEach(n=>n.classList.toggle('active',n.dataset.viewPanel===view));if(view!=='chat')renderPanels();if(view==='tasks')void refreshTasks();closeRail()}
  function renderRecent(){const root=$('#recentTasks');const items=state.sessions.slice(0,14);root.innerHTML=items.length?items.map(s=>'<button type="button" class="recent-item" data-session="'+esc(s.id)+'">'+esc(s.title||'새 작업')+'</button>').join(''):'<div class="section-title">아직 작업이 없습니다.</div>';root.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{state.activeId=b.dataset.session;setView('chat');renderMessages()})}
  function renderMessages(){const s=state.sessions.find(x=>x.id===state.activeId);const messages=s?.messages||[];$('#emptyState').hidden=messages.length>0;$('#messages').innerHTML=messages.map(m=>{
    const meta=[m.provider,m.target,m.status&&statusLabel(m.status)].filter(Boolean).join(' · ');
    const task=m.taskId?'<div class="execution-card"><strong>EKODI Task '+esc(m.taskId)+'</strong><span>'+esc(statusLabel(m.status))+'</span></div>':'';
    return '<article class="turn '+esc(m.role)+'"><div class="meta">'+esc(m.role==='user'?'사용자':'EKODI')+(meta?' · '+esc(meta):'')+'</div><div class="bubble">'+esc(m.text)+'</div>'+task+'</article>';
  }).join('');requestAnimationFrame(()=>{const c=$('#conversation');if(document.documentElement.dataset.controlEmbed==='admin'&&c)c.scrollTo({top:c.scrollHeight,behavior:'smooth'});else window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})})}
  function historyForAssist(){const s=state.sessions.find(x=>x.id===state.activeId);return (s?.messages||[]).filter(m=>m.role==='user'||m.role==='assistant').slice(-8).map(m=>({role:m.role,text:m.text}))}
  function authDisplay(label,ok=false,detail=''){
    state.authenticated=ok;
    $('#authState').textContent=label;
    $('#runtimeStatus').textContent=label;
    $('#runtimeStatus').classList.toggle('ok',ok);
    const banner=$('#authBanner');
    banner.hidden=ok;
    $('#authBannerText').textContent=detail||'EKODI 최고관리자 로그인이 필요합니다. 로그인 후 Control로 돌아오세요.';
  }
  async function verifySession(){
    if(state.authPromise)return state.authPromise;
    state.authPromise=(async()=>{
      const checkedToken=token();
      if(!checkedToken){resetPrivateSurface();authDisplay('로그인 필요');return false}
      authDisplay('서버 인증 확인 중',false,'저장된 토큰의 권한과 유효기간을 확인하고 있습니다.');
      try{
        const session=await api('/api/session');
        if(token()!==checkedToken){resetPrivateSurface();authDisplay('계정 변경 확인 중');return false}
        if(session?.authenticated===true && session?.role==='super_admin' && bindAccount(session)){
          authDisplay('최고관리자 인증됨',true);
          return true;
        }
        resetPrivateSurface();
        authDisplay(session?.authenticated?'최고관리자 계정 확인 필요':'로그인 필요');
        return false;
      }catch(error){
        resetPrivateSurface();
        authDisplay(error?.auth?'로그인 만료':'인증 확인 실패',false,error?.auth?'로그인 세션이 만료되었거나 권한이 없습니다.':'인증 서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
        return false;
      }
    })();
    try{return await state.authPromise}finally{state.authPromise=null}
  }
  async function preflightCommand(message){
    // A successful observation, not a client-side assertion, is the only evidence
    // that may satisfy EKODI Command Plane standing-delegation preflight.
    const checked=await api('/api/control/ai/actions',{method:'POST',body:JSON.stringify({
      agentId:'chief',actionType:'service.health_check',area:'health_checks',target:'control',
      rationale:'Control 명령 실행 전 사전점검: '+message.slice(0,500),
      payload:{source:'control-surface',pathname:'/admin/control',request:message.slice(0,1000)},
      reversible:true,delegated:true,preflightVerified:false
    })});
    return checked?.ok===true && checked?.status==='verified' && checked?.execution?.ok===true;
  }
  async function submitCommand(value){
    if(state.busy)return;
    const message=String(value||'').trim();
    if(!message){toast('실행할 명령이나 질문을 입력해 주세요.');return}
    state.busy=true;$('#sendButton').disabled=true;
    try{
      if(!(await verifySession())){toast('최고관리자 인증을 확인한 뒤 다시 실행해 주세요.');return}
      const commandOwner=state.storageOwner,commandEpoch=state.authEpoch,commandToken=token();
      const sameOperator=()=>state.authenticated&&state.storageOwner===commandOwner&&
        state.authEpoch===commandEpoch&&token()===commandToken;
      if(!sameOperator())return;
      const target=$('#executionTarget').value,executeNow=$('#executeNow').checked;
      const prior=historyForAssist();
      pushMessage('user',message,{target});$('#commandInput').value='';resizeInput();
      let queued=null,preflightProblem='';
      if(executeNow){
        try{
          const preflight=await preflightCommand(message);
          if(!sameOperator())return;
          if(!preflight){
            preflightProblem='서버 사전점검이 통과하지 않아 자동실행을 접수하지 않았습니다.';
          }else{
            queued=await api('/api/control/ai/v8/pulse',{method:'POST',body:JSON.stringify({
              goal:message,risk:'normal',
              target:{capability:'core.automation',service:'control',section:'command',surface:'control',providerHint:target},
              delegation:{allowed:true,reversible:true,audited:true,preflightVerified:preflight,verificationDefined:true},
              context:{source:'control-surface',pathname:'/admin/control',executionTarget:target,request:message},
              event:{kind:'control_command',source:'control-surface',summary:message,changeClass:'yellow',actionable:true,requiresHumanDecision:false},
              executeNow:true
            })});
            if(!sameOperator())return;
          }
        }catch(error){
          if(!sameOperator())return;
          preflightProblem='자동실행은 접수되지 않았습니다. '+(error.auth?'로그인 권한을 다시 확인해 주세요.':error.message);
        }
      }
      if(!sameOperator())return;
      const taskId=queued?.task?.id||queued?.execution?.results?.[0]?.taskId||'';
      const taskStatus=queued?.task?.state||queued?.execution?.results?.[0]?.state||(preflightProblem?'preflight_failed':executeNow?'queued':'assist_only');
      if(taskId){state.tasks.unshift({id:taskId,title:title(message),status:taskStatus,target,at:now()});state.tasks=state.tasks.slice(0,40);saveState()}
      let reply='',provider='EKODI';
      try{
        const result=await api('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message,history:prior,context:{source:'control-surface',section:'command',title:'EKODI Control',pathname:'/admin/control',executionTarget:target,taskId}})});
        if(!sameOperator())return;
        provider=result.provider||'EKODI';
        reply=String(result.reply||'').trim()||'AI가 유효한 답변을 반환하지 않았습니다. 명령 전달 기록을 확인해 주세요.';
      }catch(error){
        if(!sameOperator())return;
        reply='AI 설명을 받지 못했습니다. '+error.message;
      }
      if(!sameOperator())return;
      if(queued?.task?.state==='auto_blocked')reply='EKODI 정책에 따라 자동실행이 차단되었습니다. 승인·검증 상태를 확인해 주세요.\n\n'+reply;
      if(preflightProblem)reply=preflightProblem+'\n\n'+reply;
      pushMessage('assistant',reply,{provider,target,status:taskStatus,taskId});
      state.results.unshift({title:title(message),summary:reply.slice(0,280),provider,taskId,status:taskStatus,at:now()});
      state.results=state.results.slice(0,40);saveState();renderPanels();
    }finally{
      state.busy=false;$('#sendButton').disabled=false;$('#commandInput').focus();
    }
  }
  function card(titleText,status,description){return '<article class="card"><div class="card-head"><strong>'+esc(titleText)+'</strong><span class="badge">'+esc(status)+'</span></div><p>'+esc(description||'')+'</p></article>'}
  // Read-only, authenticated task status. Browser history is never evidence of a
  // current server outcome, and errors must not be labeled as verified completion.
  async function refreshTasks(){
    if(state.taskRefreshing)return;
    const requestId=++state.taskRequestId;
    state.taskRefreshing=true;
    state.taskSource='pending';
    renderPanels();
    try{
      if(!(await verifySession()))throw new Error('최고관리자 인증을 확인할 수 없습니다.');
      if(requestId!==state.taskRequestId)return;
      const owner=state.storageOwner,epoch=state.authEpoch,requestToken=token();
      const snapshot=await api('/api/control/ai/v8/tasks?limit=40');
      // An old response must never repopulate another account's task panel.
      if(requestId!==state.taskRequestId||state.authEpoch!==epoch||
         state.storageOwner!==owner||token()!==requestToken)return;
      if(snapshot?.ok!==true||!Array.isArray(snapshot.tasks))throw new Error('작업 목록 응답을 확인할 수 없습니다.');
      state.liveTasks=snapshot.tasks.slice(0,40).filter(task=>task&&typeof task==='object').map(task=>({
        id:String(task.id||'').slice(0,160),
        title:title(task.goal||task.id),
        status:String(task.state||'unknown').slice(0,80),
        target:'EKODI 작업장부',
        at:task.updatedAt||task.createdAt||''
      }));
      state.taskCheckedAt=now();
      state.taskSource='server';
      state.taskNotice='';
    }catch(error){
      if(requestId!==state.taskRequestId)return;
      state.taskSource='error';
      state.taskNotice=error?.auth?'관리자 인증이 만료됐습니다. 다시 로그인해 주세요.':'서버 작업 상태를 확인할 수 없습니다. 아래 목록은 현재 브라우저에 기록된 내용입니다.';
    }finally{
      if(requestId===state.taskRequestId){
        state.taskRefreshing=false;
        renderPanels();
      }
    }
  }
  function renderPanels(){
    const serverVerified=state.taskSource==='server';
    const visibleTasks=serverVerified?state.liveTasks:state.tasks;
    const sourceCard=state.taskSource==='pending'
      ?card('EKODI 작업장부 조회','확인 중','서버에서 최신 작업 상태를 확인하고 있습니다.')
      :serverVerified
        ?card('EKODI 서버 작업장부','서버 확인',state.taskCheckedAt+' 확인 · 최근 '+visibleTasks.length+'건 (최대 40건)')
        :card('브라우저 임시 기록','서버 미확인',state.taskNotice||'이 목록은 서버에서 현재 실행 상태를 확인한 결과가 아닙니다. 새로고침으로 확인하세요.');
    $('#taskCards').innerHTML=sourceCard+(visibleTasks.length?visibleTasks.map(t=>card(t.title,serverVerified?statusLabel(t.status):statusLabel(t.status)+' · 서버 미확인',(t.id||'')+' · '+(t.target||'auto'))).join(''):card(serverVerified?'서버 작업장부가 비어 있습니다':'저장된 작업이 없습니다',serverVerified?'서버 확인':'미확인',serverVerified?'최근 40개 범위에서 표시할 작업이 없습니다.':'명령 기록이 없거나 최신 서버 상태를 조회하지 못했습니다.'));
    $('#agentCards').innerHTML=AGENTS.map(([id,name,kind])=>card(name,id==='ekodi'?'최종 통제':'연결 대상',kind+' · EKODI 라우팅/권한 정책 적용')).join('');
    $('#workerCards').innerHTML=WORKERS.map(([id,name])=>card(name,'상태는 실행 시 확인',id+' 실행계층')).join('');
    const resultNotice=card('AI 응답과 실행 증빙은 별개입니다','확인 안내','여기에는 브라우저에 저장된 AI 답변 기록이 표시됩니다. 실제 실행 상태는 작업 탭의 EKODI 서버 작업장부에서 확인하세요.');
    $('#resultCards').innerHTML=resultNotice+(state.results.length?state.results.map(r=>card(r.title,r.taskId?'AI 응답 · 작업 상태 별도 확인':'AI 설명 · 실행 미확인',(r.provider||'EKODI')+(r.taskId?' · Task '+r.taskId:'')+'\n'+r.summary)).join(''):card('아직 AI 응답 기록이 없습니다','브라우저 기록','명령을 입력하면 AI 답변 요약이 여기에 저장됩니다.'));
  }
  function resizeInput(){const input=$('#commandInput');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,190)+'px'}
  function newTask(){state.activeId=null;setView('chat');renderMessages();$('#commandInput').focus()}
  function closeRail(){$('#controlRail').classList.remove('open')}
  function bind(){
    $$('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);const next=new URL(location.href);if(b.dataset.view==='chat')next.searchParams.delete('view');else next.searchParams.set('view',b.dataset.view);history.replaceState(null,'',next.pathname+next.search+next.hash);});
    $('#newTask').onclick=newTask;$('#railOpen').onclick=()=>$('#controlRail').classList.add('open');$('#railClose').onclick=closeRail;
    $('#commandForm').addEventListener('submit',e=>{e.preventDefault();submitCommand($('#commandInput').value)});
    $('#commandInput').addEventListener('input',resizeInput);
    $('#commandInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#commandForm').requestSubmit()}});
    $$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#commandInput').value=b.dataset.prompt;resizeInput();$('#commandInput').focus()});
    $$('[data-refresh]').forEach(b=>b.onclick=()=>{if(b.closest('#viewTasks')){void refreshTasks();return}renderPanels();toast('브라우저에 저장된 기록을 다시 표시했습니다.')});
    // Avoid continuous polling: reconcile durable task states only when the
    // operator returns to a visible Tasks view. No request runs in background.
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState!=='visible')return;
      if(state.view==='tasks')void refreshTasks();
      else if(state.authenticated)void verifySession();
    });
  }
  async function boot(){
    bind();renderRecent();renderMessages();renderPanels();
    const requestedView=new URLSearchParams(location.search).get('view');
    if(['tasks','agents','workers','results'].includes(requestedView))setView(requestedView);
    await verifySession();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();