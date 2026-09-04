import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const STATUS_LABEL={pending:'진행 중',approved:'승인',rejected:'반려',cancelled:'취소'};
const PRIORITY_LABEL={low:'낮음',normal:'보통',high:'높음',urgent:'긴급'};
const RISK_LABEL={low:'낮은 영향',medium:'중간 영향',high:'높은 영향',critical:'중대 영향'};
const EVENT_LABEL={'request.submitted':'요청 등록','decision.approved':'승인','decision.rejected':'반려','request.cancelled':'요청 취소'};
let session=null;
let personId='';
let approvals=[];
let eventsByApproval=new Map();
let executionsByApproval=new Map();
let filter='action';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const date=value=>value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'기한 없음';
const shortDate=value=>value?new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'기한 없음';
const isRequester=item=>Boolean(personId&&item.requester_person_id===personId);
const isAssignee=item=>Boolean(personId&&item.assignee_person_id===personId);
const isDone=item=>item.status!=='pending';
const dueSoon=item=>item.status==='pending'&&item.due_at&&new Date(item.due_at).getTime()<=Date.now()+48*60*60*1000;
const overdue=item=>item.status==='pending'&&item.due_at&&new Date(item.due_at).getTime()<Date.now();
function authTarget(){
  const target=new URL(cfg.authUrl||'https://auth.ekodi.kr/?site=my');
  target.searchParams.set('site','my');
  target.searchParams.set('return_to',location.href.split('#')[0]);
  return target.href;
}

async function handoff(){
  if(!sb||!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return;
  const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});
  history.replaceState({},document.title,`${location.pathname}${location.search}`);
  if(error)throw error;
}

function setAuthUi(){
  const label=session?'로그아웃':'Google로 시작';
  $('#authButton').textContent=enabled?label:'격리 스테이징';
  $('#authButton').disabled=!enabled;
  $('#gateLoginButton').textContent=enabled?'Google로 시작':'운영 데이터 미연결';
  $('#gateLoginButton').disabled=!enabled;
  $('#loginGate').hidden=Boolean(session);
  $('#approvalWorkspace').hidden=!session;
}

async function authAction(){
  if(!enabled)return;
  if(!session){location.assign(authTarget());return;}
  await sb.auth.signOut();
}
async function loadData(){
  approvals=[];eventsByApproval=new Map();executionsByApproval=new Map();personId='';
  if(!sb||!session)return render();
  const [{data:person,error:personError},{data:rows,error:approvalError}]=await Promise.all([
    sb.rpc('my_approval_person_id'),
    sb.from('approval_requests').select('*').order('created_at',{ascending:false})
  ]);
  if(personError)throw personError;
  if(approvalError)throw approvalError;
  personId=String(person||'');
  approvals=Array.isArray(rows)?rows:[];
  const ids=approvals.map(item=>item.id);
  if(ids.length){
    const [{data:eventRows,error:eventError},{data:executionRows,error:executionError}]=await Promise.all([
      sb.from('approval_events').select('*').in('approval_id',ids).order('created_at',{ascending:true}),
      sb.from('approval_executions').select('*').in('approval_id',ids).order('created_at',{ascending:true})
    ]);
    if(eventError)throw eventError;
    if(executionError)throw executionError;
    for(const item of eventRows||[]){const bucket=eventsByApproval.get(item.approval_id)||[];bucket.push(item);eventsByApproval.set(item.approval_id,bucket)}
    for(const item of executionRows||[]){const bucket=executionsByApproval.get(item.approval_id)||[];bucket.push(item);executionsByApproval.set(item.approval_id,bucket)}
  }
  render();
}

function summary(){
  return {
    action:approvals.filter(item=>item.status==='pending'&&isAssignee(item)).length,
    due:approvals.filter(item=>dueSoon(item)&&isAssignee(item)).length,
    requested:approvals.filter(isRequester).length,
    done:approvals.filter(isDone).length
  };
}
function filteredApprovals(){
  if(filter==='action')return approvals.filter(item=>item.status==='pending'&&isAssignee(item));
  if(filter==='requested')return approvals.filter(isRequester);
  if(filter==='pending')return approvals.filter(item=>item.status==='pending');
  if(filter==='done')return approvals.filter(isDone);
  return approvals;
}

function eventTimeline(item){
  const events=eventsByApproval.get(item.id)||[];
  const executions=executionsByApproval.get(item.id)||[];
  const eventHtml=events.map(event=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(EVENT_LABEL[event.event_type]||event.event_type)}</strong><span>${esc(date(event.created_at))}${event.comment?` · ${esc(event.comment)}`:''}</span></div></div>`).join('');
  const executionHtml=executions.map(run=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>실행 · ${esc(run.action_type)} · ${esc(run.status)}</strong><span>${esc(date(run.created_at))}${run.error_text?` · ${esc(run.error_text)}`:''}</span></div></div>`).join('');
  if(!eventHtml&&!executionHtml)return '<div class="timeline-item"><span class="timeline-dot"></span><div><strong>기록 준비 중</strong><span>추가 이력이 아직 없습니다.</span></div></div>';
  return `${eventHtml}${executionHtml}`;
}

function renderCard(item){
  const actionRequired=item.status==='pending'&&isAssignee(item);
  const requesterPending=item.status==='pending'&&isRequester(item);
  const workspace=item.workspace_key||item.scope||'개인';
  const dueLabel=overdue(item)?`기한 지남 · ${shortDate(item.due_at)}`:item.due_at?`기한 ${shortDate(item.due_at)}`:'기한 없음';
  const urgent=item.priority==='urgent'||item.risk_level==='critical';
  const ai=item.ai_summary?`<div class="ai-note"><small>AI 참고 요약 · 결재 판단 아님</small><p>${esc(item.ai_summary)}</p></div>`:'';
  const approve=actionRequired?'<button class="primary" data-decision="approved" type="button">승인</button><button class="secondary" data-decision="rejected" type="button">반려</button>':'';
  const cancel=requesterPending&&!actionRequired?'<button class="secondary" data-decision="cancelled" type="button">요청 취소</button>':'';
  return `<article class="approval-card${urgent?' is-urgent':''}" data-approval-id="${esc(item.id)}">
    <div class="approval-card-head"><div><div class="badges"><span class="badge ${esc(item.status)}">${esc(STATUS_LABEL[item.status]||item.status)}</span><span class="badge priority-${esc(item.priority)}">우선순위 ${esc(PRIORITY_LABEL[item.priority]||item.priority)}</span><span class="badge risk-${esc(item.risk_level)}">${esc(RISK_LABEL[item.risk_level]||item.risk_level)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.description||'설명이 없습니다.')}</p></div><span class="badge">${isAssignee(item)&&isRequester(item)?'요청 · 결재':isAssignee(item)?'내 결재':'내 요청'}</span></div>
    <div class="approval-meta"><span>${esc(workspace)}</span><span>${esc(item.source_service||'ekodi')}</span><span>${esc(dueLabel)}</span><span>요청 ${esc(shortDate(item.submitted_at||item.created_at))}</span></div>
    ${ai}
    ${(approve||cancel)?`<div class="approval-actions">${cancel}${approve}</div>`:''}
    <details class="approval-details"><summary>결재 타임라인 · 실행 기록</summary><div class="timeline">${eventTimeline(item)}</div></details>
  </article>`;
}
function bindDecisionButtons(){
  $('#approvalList').querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',()=>{
    const card=button.closest('[data-approval-id]');
    const item=approvals.find(row=>row.id===card?.dataset.approvalId);
    if(!item)return;
    openDecision(item,button.dataset.decision||'');
  }));
}

function render(){
  setAuthUi();
  if(!session)return;
  const counts=summary();
  $('#actionCount').textContent=String(counts.action);
  $('#dueCount').textContent=String(counts.due);
  $('#requestedCount').textContent=String(counts.requested);
  $('#doneCount').textContent=String(counts.done);
  const rows=filteredApprovals();
  $('#approvalStatus').textContent=approvals.length?`내 결재 관련 ${approvals.length}건 · 현재 보기 ${rows.length}건`:'현재 연결된 결재가 없습니다.';
  $('#approvalList').innerHTML=rows.length?rows.map(renderCard).join(''):'<div class="empty-approval"><strong>지금 확인할 결재가 없습니다.</strong><span>새로운 결정이 필요할 때 이곳에 조용히 모아 보여드립니다.</span></div>';
  $$('#approvalFilters [data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter===filter));
  bindDecisionButtons();
}

function openDecision(item,decision){
  const copy=decision==='approved'?'승인하면 결정 기록이 남습니다. 실제 실행 성공 여부는 별도 기록으로 확인합니다.':decision==='rejected'?'반려 이유를 남기면 요청자에게 같은 결재 기록 안에서 전달됩니다.':'요청을 취소하면 대기 중인 결재가 종료됩니다.';
  $('#decisionApprovalId').value=item.id;
  $('#decisionValue').value=decision;
  $('#decisionTitle').textContent=decision==='approved'?'이 결재를 승인할까요?':decision==='rejected'?'이 결재를 반려할까요?':'이 요청을 취소할까요?';
  $('#decisionCopy').textContent=copy;
  $('#decisionComment').value='';
  $('#decisionSubmit').textContent=decision==='approved'?'승인':decision==='rejected'?'반려':'요청 취소';
  $('#decisionDialog').showModal();
}
async function submitDecision(event){
  event.preventDefault();
  const id=$('#decisionApprovalId').value;
  const decision=$('#decisionValue').value;
  const comment=$('#decisionComment').value.trim();
  const button=$('#decisionSubmit');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='기록 중…';
  try{
    const result=decision==='cancelled'
      ?await sb.rpc('cancel_approval',{p_approval_id:id,p_comment:comment||null})
      :await sb.rpc('decide_approval',{p_approval_id:id,p_decision:decision,p_comment:comment||null});
    if(result.error)throw result.error;
    $('#decisionDialog').close();
    await loadData();
  }catch(error){
    console.error('approval decision',error);
    $('#decisionCopy').textContent='결정을 기록하지 못했습니다. 현재 상태를 다시 확인해 주세요.';
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}
async function bootstrap(){
  setAuthUi();
  if(!enabled)return;
  try{await handoff()}catch(error){console.error('approval auth handoff',error)}
  const {data}=await sb.auth.getSession();
  session=data.session;
  setAuthUi();
  if(session){
    try{await loadData()}catch(error){
      console.error('approval load',error);
      $('#approvalStatus').textContent='결재 데이터를 불러오지 못했습니다.';
      $('#approvalList').innerHTML='<div class="empty-approval"><strong>결재함 연결을 확인하는 중입니다.</strong><span>기존 상태를 추측하지 않고 안전하게 멈췄습니다.</span></div>';
    }
  }
}

$('#authButton').addEventListener('click',authAction);
$('#gateLoginButton').addEventListener('click',authAction);
$('#decisionCancel').addEventListener('click',()=>$('#decisionDialog').close());
$('#decisionForm').addEventListener('submit',submitDecision);
$$('#approvalFilters [data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter||'all';render()}));

if(sb)sb.auth.onAuthStateChange(async(_event,next)=>{session=next;setAuthUi();if(session)await loadData();else render()});
await bootstrap();