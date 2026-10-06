(() => {
  'use strict';
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
  function statusLabel(v){return ({queued:'대기',running:'실행 중',verified:'완료',resolved:'완료',failed:'실패',blocked:'차단',core_only:'Core 처리',human_gate:'확인 필요',assist_only:'검토',ready_for_executor:'실행 대기',approved_pending_executor:'승인됨'})[v]||v||'진행'}
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
  function setView(view){state.view=view;$$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));$$('[data-view-panel]').forEach(n=>n.classList.toggle('active',n.dataset.viewPanel===view));if(view!=='chat')renderPanels();closeRail()}
  function renderRecent(){const root=$('#recentTasks');const items=state.sessions.slice(0,14);root.innerHTML=items.length?items.map(s=>'<button type="button" class="recent-item" data-session="'+esc(s.id)+'">'+esc(s.title||'새 작업')+'</button>').join(''):'<div class="section-title">아직 작업이 없습니다.</div>';root.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{state.activeId=b.dataset.session;setView('chat');renderMessages()})}
  function renderMessages(){const s=state.sessions.find(x=>x.id===state.activeId);const messages=s?.messages||[];$('#emptyState').hidden=messages.length>0;$('#messages').innerHTML=messages.map(m=>{
    const meta=[m.provider,m.target,m.status&&statusLabel(m.status)].filter(Boolean).join(' · ');
    const task=m.taskId?'<div class="execution-card"><strong>EKODI Task '+esc(m.taskId)+'</strong><span>'+esc(statusLabel(m.status))+'</span></div>':'';
    return '<article class="turn '+esc(m.role)+'"><div class="meta">'+esc(m.role==='user'?'사용자':'EKODI')+(meta?' · '+esc(meta):'')+'</div><div class="bubble">'+esc(m.text)+'</div>'+task+'</article>';
  }).join('');requestAnimationFrame(()=>{const c=$('#conversation');window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})})}
  function historyForAssist(){const s=state.sessions.find(x=>x.id===state.activeId);return (s?.messages||[]).filter(m=>m.role==='user'||m.role==='assistant').slice(-8).map(m=>({role:m.role,text:m.text}))}
  async function submitCommand(value){
    if(state.busy)return;const message=String(value||'').trim();if(!message)return;
    state.busy=true;$('#sendButton').disabled=true;const target=$('#executionTarget').value;const executeNow=$('#executeNow').checked;
    const prior=historyForAssist();pushMessage('user',message,{target});$('#commandInput').value='';resizeInput();
    let queued=null;
    try{
      if(executeNow){
        queued=await api('/api/control/ai/v8/pulse',{method:'POST',body:JSON.stringify({
          goal:message,risk:'normal',
          target:{capability:'core.automation',service:'control',section:'command',surface:'control',providerHint:target},
          delegation:{allowed:true,reversible:true,audited:true,preflightVerified:false,verificationDefined:true},
          context:{source:'control-surface',pathname:'/control',executionTarget:target,request:message},
          event:{kind:'control_command',source:'control-surface',summary:message,changeClass:'yellow',actionable:true,requiresHumanDecision:false},
          executeNow:true
        })});
      }
      const taskId=queued?.task?.id||queued?.execution?.results?.[0]?.taskId||'';
      const taskStatus=queued?.task?.state||queued?.execution?.results?.[0]?.state||(executeNow?'queued':'assist_only');
      if(taskId){state.tasks.unshift({id:taskId,title:title(message),status:taskStatus,target,at:now()});state.tasks=state.tasks.slice(0,40);saveState()}
      const result=await api('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message,history:prior,context:{source:'control-surface',pathname:'/control',executionTarget:target,taskId}})});
      const reply=String(result.reply||'응답을 받지 못했습니다.');
      pushMessage('assistant',reply,{provider:result.provider||'EKODI',target,status:taskStatus,taskId});
      state.results.unshift({title:title(message),summary:reply.slice(0,280),provider:result.provider||'EKODI',taskId,status:taskStatus,at:now()});state.results=state.results.slice(0,40);saveState();renderPanels();
    }catch(error){
      pushMessage('assistant',error.message,{status:'failed',target});
      if(error.auth)toast('최고관리자 로그인 후 /control로 돌아오세요.');
    }finally{state.busy=false;$('#sendButton').disabled=false;$('#commandInput').focus()}
  }
  function card(titleText,status,description){return '<article class="card"><div class="card-head"><strong>'+esc(titleText)+'</strong><span class="badge">'+esc(status)+'</span></div><p>'+esc(description||'')+'</p></article>'}
  function renderPanels(){
    $('#taskCards').innerHTML=state.tasks.length?state.tasks.map(t=>card(t.title,statusLabel(t.status),(t.id||'')+' · '+(t.target||'auto'))).join(''):card('아직 실행 작업이 없습니다','대기','대화에서 실행을 시작하면 Task가 표시됩니다.');
    $('#agentCards').innerHTML=AGENTS.map(([id,name,kind])=>card(name,id==='ekodi'?'최종 통제':'연결 대상',kind+' · EKODI 라우팅/권한 정책 적용')).join('');
    $('#workerCards').innerHTML=WORKERS.map(([id,name])=>card(name,'상태는 실행 시 확인',id+' 실행계층')).join('');
    $('#resultCards').innerHTML=state.results.length?state.results.map(r=>card(r.title,statusLabel(r.status),(r.provider||'EKODI')+(r.taskId?' · '+r.taskId:'')+'\n'+r.summary)).join(''):card('아직 결과가 없습니다','대기','명령 처리 후 검증된 결과가 이곳에 누적됩니다.');
  }
  function resizeInput(){const input=$('#commandInput');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,190)+'px'}
  function newTask(){state.activeId=null;setView('chat');renderMessages();$('#commandInput').focus()}
  function closeRail(){$('#controlRail').classList.remove('open')}
  function bind(){
    $$('.nav-item').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#newTask').onclick=newTask;$('#railOpen').onclick=()=>$('#controlRail').classList.add('open');$('#railClose').onclick=closeRail;
    $('#commandForm').addEventListener('submit',e=>{e.preventDefault();submitCommand($('#commandInput').value)});
    $('#commandInput').addEventListener('input',resizeInput);
    $('#commandInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#commandForm').requestSubmit()}});
    $$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#commandInput').value=b.dataset.prompt;resizeInput();$('#commandInput').focus()});
    $$('[data-refresh]').forEach(b=>b.onclick=()=>{renderPanels();toast('현재 Control 기록을 새로 표시했습니다.')});
  }
  async function boot(){
    bind();renderRecent();renderMessages();renderPanels();
    const logged=Boolean(token());$('#authState').textContent=logged?'최고관리자 세션':'로그인 필요';$('#runtimeStatus').textContent=logged?'EKODI 연결 준비':'로그인 필요';$('#runtimeStatus').classList.toggle('ok',logged);
    if(!logged)toast('최고관리자 로그인 세션이 필요합니다.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();