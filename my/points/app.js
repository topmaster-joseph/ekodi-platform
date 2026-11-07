import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const config=window.EKODI_MY_CONFIG||{};
const select=document.getElementById('siteSelect');
const pointTabButtons=[...document.querySelectorAll('.points-tabs [role="tab"]')];
function refreshPointTabState(){
 const current=document.body.dataset.pointsTab;
 const claim=document.getElementById('claimSection');
 const invite=document.getElementById('referralSection');
 const confirm=document.getElementById('referralConfirmSection');
 const progress=document.getElementById('pointsProgressSection');
 document.getElementById('pointsTabEmpty').hidden=current==='wallet'||
   (current==='claims'&&!claim.hidden)||
   (current==='invite'&&(!invite.hidden||!confirm.hidden))||
   (current==='progress'&&!progress.hidden);
}
function selectPointTab(name,focus=false){
 document.body.dataset.pointsTab=name;
 pointTabButtons.forEach(tab=>{
  const active=tab.dataset.pointsTab===name;
  tab.setAttribute('aria-selected',String(active));
  tab.tabIndex=active?0:-1;
  if(active&&focus)tab.focus();
 });
 refreshPointTabState();
}
pointTabButtons.forEach((tab,index)=>{
 tab.addEventListener('click',()=>selectPointTab(tab.dataset.pointsTab));
 tab.addEventListener('keydown',event=>{
  const shift=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
  if(!shift&&event.key!=='Home'&&event.key!=='End')return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?pointTabButtons.length-1:(index+shift+pointTabButtons.length)%pointTabButtons.length;
  selectPointTab(pointTabButtons[next].dataset.pointsTab,true);
 });
});

const notice=document.getElementById('notice');
const login=document.getElementById('loginLink');
const view=document.getElementById('balanceView');
const balance=document.getElementById('balance');
const historyList=document.getElementById('history');
let viewRevision=0;
const referralSection=document.getElementById('referralSection');
const referralConfirmSection=document.getElementById('referralConfirmSection');
const referralLink=document.getElementById('referralLink');
const referralStatus=document.getElementById('referralStatus');
const referralConfirmStatus=document.getElementById('referralConfirmStatus');
const claimSection=document.getElementById('claimSection');
const claimAdapter=document.getElementById('claimAdapter');
const claimStatus=document.getElementById('claimStatus');
const claimList=document.getElementById('claimList');
const progressSection=document.getElementById('pointsProgressSection');
const progressNotice=document.getElementById('pointsProgressNotice');
const progressContent=document.getElementById('pointsProgressContent');
const progressLevel=document.getElementById('pointsLevel');
const progressStreak=document.getElementById('pointsStreak');
const progressVerifiedCount=document.getElementById('pointsVerifiedCount');
const progressLevelHelp=document.getElementById('pointsLevelHelp');
const progressMissions=document.getElementById('pointsMissionList');
const weekSection=document.getElementById('pointsWeeklySection');
const weekSummary=document.getElementById('pointsWeeklySummary');
const weekDays=document.getElementById('pointsWeekDays');
const goalSection=document.getElementById('pointsGoalSection');
const goalForm=document.getElementById('pointsGoalForm');
const weeklyTarget=document.getElementById('pointsWeeklyTarget');
const ninetyTarget=document.getElementById('pointsNinetyTarget');
const goalSummary=document.getElementById('pointsGoalSummary');
const goalStatus=document.getElementById('pointsGoalStatus');
const goalSave=document.getElementById('pointsSaveGoal');
const goalReset=document.getElementById('pointsResetGoal');
let currentProgress=null;
let currentGoal=null;
const weekDayNames=['월','화','수','목','금','토','일'];
function renderWeek(data){
  weekSection.hidden=true;
  weekSummary.textContent='';
  weekDays.replaceChildren();
  const week=data?.week;
  if(!week||!Array.isArray(week.days)||week.days.length!==7)return;
  const active=Number(week.active_days),approved=Number(week.approved_activities),pending=Number(week.pending_activities);
  if(![active,approved,pending].every(x=>Number.isSafeInteger(x)&&x>=0))return;
  weekSummary.textContent='승인 활동 '+approved.toLocaleString('ko-KR')+'건 · 참여한 날 '+active+'일'+
    (pending?' · 승인 대기 '+pending+'건':'');
  week.days.forEach((day,index)=>{
    const item=document.createElement('span');
    const accepted=Number(day.approved)||0,waiting=Number(day.pending)||0;
    const future=String(day.date)>String(data.date);
    item.dataset.weekStatus=accepted>0?'approved':waiting>0?'pending':'empty';
    item.setAttribute('role','listitem');
    item.setAttribute('aria-label',String(day.date).slice(0,10)+' 승인 '+accepted+'건, 대기 '+waiting+'건');
    const label=document.createElement('small');
    label.textContent=weekDayNames[index];
    const detail=document.createElement('strong');
    detail.textContent=future?'예정':accepted>0?accepted+'건':waiting>0?'대기':'—';
    item.append(label,detail);weekDays.append(item);
  });
  weekSection.hidden=false;
}
function renderGoalSummary(){
  if(!currentGoal||!currentProgress){goalSummary.textContent='';return;}
  const targetDays=Number(currentGoal.weekly_target_days);
  const targetCount=Number(currentGoal.target_activities_90d);
  const active=Number(currentProgress.week?.active_days);
  const activities=Number(currentProgress.level?.verified_activities_90d);
  if(![targetDays,targetCount,activities].every(Number.isSafeInteger))return;
  goalSummary.textContent=(Number.isSafeInteger(active)?
    '이번 주 '+active+'/'+targetDays+'일 · ':'이번 주 참여 기록 확인 중 · ')+
    '90일 '+activities+'/'+targetCount+'건'+
    (currentProgress.complete_window===false?' (일부 기록만 반영)':'');
}
function renderGoal(data){
  const weekly=Number(data?.weekly_target_days),count=Number(data?.target_activities_90d);
  if(!Number.isSafeInteger(weekly)||weekly<1||weekly>7||
     !Number.isSafeInteger(count)||count<3||count>90)throw new Error('GOAL_INVALID_RESPONSE');
  currentGoal={weekly_target_days:weekly,target_activities_90d:count};
  weeklyTarget.value=String(weekly);
  // A custom target may be outside the preset choices; preserve it accessibly.
  if(!ninetyTarget.querySelector('option[value="'+count+'"]')){
    const option=new Option(count+'건',String(count));
    ninetyTarget.add(option);
  }
  ninetyTarget.value=String(count);
  goalSection.hidden=false;
  renderGoalSummary();
}

const PROGRESS_STATUS={available:'참여 가능',pending:'승인 대기',completed:'승인 완료'};
function clearProgress(){
  progressSection.hidden=true;
  progressContent.hidden=true;
  progressLevel.textContent='—';
  progressStreak.textContent='—';
  progressVerifiedCount.textContent='—';
  progressLevelHelp.textContent='';
  progressMissions.replaceChildren();
  currentProgress=null;currentGoal=null;
  weekSection.hidden=true;weekSummary.textContent='';weekDays.replaceChildren();
  goalSection.hidden=true;goalStatus.textContent='';goalSummary.textContent='';
  weeklyTarget.value='3';ninetyTarget.value='10';
  progressNotice.textContent='검증된 활동 정보를 확인하고 있습니다.';
  refreshPointTabState();
}
function renderProgress(data){
  if(data?.reward_policy!=='recognition_only'||!Array.isArray(data.missions)||
     !data.level||!data.streak)throw new Error('PROGRESS_INVALID_RESPONSE');
  progressLevel.textContent=String(data.level.label||'—').slice(0,32);
  const days=Number(data.streak.current_days);
  const count=Number(data.level.verified_activities_90d);
  progressStreak.textContent=Number.isSafeInteger(days)&&days>=0?days.toLocaleString('ko-KR')+'일':'—';
  progressVerifiedCount.textContent=Number.isSafeInteger(count)&&count>=0?count.toLocaleString('ko-KR')+'건':'—';
  const next=Number(data.level.next_at);
  progressLevelHelp.textContent=data.level.next_at===null?
    '현재 최고 성취 단계입니다. 회원 권한이나 금전적 보상은 변경되지 않습니다.':
    Number.isSafeInteger(next)&&next>=0?
      '다음 단계까지 검증 활동 '+Math.max(0,next-count).toLocaleString('ko-KR')+'건이 남았습니다.':
      '현재 단계의 다음 목표를 확인할 수 없습니다.';
  progressMissions.replaceChildren();
  const missions=data.missions.slice(0,50);
  if(!missions.length){
    progressMissions.textContent='현재 이 사이트에 승인된 활동 미션이 없습니다.';
  }else{
    for(const mission of missions){
      const row=document.createElement('div');row.className='record';
      const labelWrap=document.createElement('div');
      const label=document.createElement('strong');
      label.textContent=ADAPTER_NAMES[mission.adapter]||'검증 활동';
      const rule=document.createElement('small');
      rule.textContent='확인된 활동만 반영 · '+String(mission.rule_id||'').slice(0,64);
      labelWrap.append(label,rule);
      const stateWrap=document.createElement('div');
      const state=document.createElement('strong');
      state.textContent=PROGRESS_STATUS[mission.today_status]||'참여 가능';
      const expected=Number(mission.points_if_approved);
      const amount=document.createElement('small');
      amount.textContent=Number.isSafeInteger(expected)&&expected>0?
        '승인 시 +'+expected.toLocaleString('ko-KR')+' P':'승인 후 정책 적용';
      stateWrap.append(state,amount);
      row.append(labelWrap,stateWrap);
      progressMissions.append(row);
    }
  }
  currentProgress=data;
  renderWeek(data);
  renderGoalSummary();
  progressNotice.textContent=data.complete_window===false?
    '최근 90일 기록 일부만 반영되었습니다. 레벨과 연속 참여는 잠정치입니다.':
    '서버에서 확인한 활동 기록입니다. 포인트는 별도 승인 정책으로 지급됩니다.';
  progressContent.hidden=false;
  progressSection.hidden=false;
  refreshPointTabState();
}

const ADAPTER_NAMES={content_approval:'콘텐츠 작성(승인 필요)',meeting_participation:'모임 참여',
  lecture_completion:'강의 완료',devotion_self_report:'말씀 묵상 기록',operator_confirmed:'운영자 확인 활동',attendance_checkin:'출석'};
const CLAIM_STATUS={pending:'확인 대기',approved:'승인·적립',rejected:'반려',duplicate:'이미 적립됨'};
const CLAIM_ERRORS={EVIDENCE_CLAIM_DAILY_LIMIT:'오늘 신청 가능한 횟수(10건)를 모두 사용했습니다.',
  EVIDENCE_CLAIM_NOT_AVAILABLE:'지금은 이 증빙을 신청할 수 없습니다.',INVALID_EVIDENCE_REF:'증빙 참조 형식을 확인해 주세요(영문·숫자·/·:·-, 3~120자).'};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inviteCode=new URLSearchParams(location.search).get('invite')||'';

const enabled=Boolean(config.dataEnabled&&config.pointsEnabled===true&&config.supabaseUrl&&config.supabasePublishableKey);
const sb=enabled?createClient(config.supabaseUrl,config.supabasePublishableKey,
  {auth:{detectSessionInUrl:true,persistSession:true}}):null;
const api=enabled?config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/points-api':'';
const returnTo=new URL(location.href);returnTo.hash='';
const authUrl=new URL('https://ekodi.kr/auth/?site=my');
authUrl.searchParams.set('return_to',returnTo.href);
login.href=authUrl.toString();

// Reuse the same canonical one-time My EKODI auth handoff as /my/app.js.
// The OTP proof is never sent to the points API or retained in navigation history.
// start() can re-enter from onAuthStateChange(SIGNED_IN) while the first
// verifyOtp is still in flight; share one handoff so the link is redeemed once.
let handoffOnce=null;
function handoff(){return handoffOnce||=redeemHandoff();}
async function redeemHandoff(){
  if(!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return;
  try{
    if(!sb)return;
    const type=params.get('ekodi_type')||'email';
    const {error}=await sb.auth.verifyOtp({token_hash:token,type});
    if(error){
      // A one-time link already redeemed by an earlier load of this page (reload,
      // back/forward, shell re-boot) is fine when that load stored the session.
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw error;
    }
  } finally {
    window.history.replaceState({},document.title,location.pathname+location.search);
  }
}
function showMessage(text){notice.textContent=text;view.hidden=true;}
function showReferralControls(site,authorized){
  const active=enabled&&authorized===true&&site==='my';
  referralSection.hidden=!active;
  referralConfirmSection.hidden=!active||!uuidPattern.test(inviteCode);
  refreshPointTabState();
}
function removeConfirmedInviteFromUrl(){
  const url=new URL(location.href);
  url.searchParams.delete('invite');
  window.history.replaceState({},document.title,url.pathname+url.search);
  authUrl.searchParams.set('return_to',url.toString());
  login.href=authUrl.toString();
}
async function issueReferralInvite(){
  if(!enabled||select.value!=='my'||!sb)return;
  const button=document.getElementById('createReferralInvite');
  button.disabled=true;
  referralStatus.textContent='가입확인용 링크를 발급하고 있습니다.';
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw Error('AUTH_REQUIRED');
    const {data,error}=await sb.rpc('ekodi_points_issue_share_invite',{p_site:'my'});
    if(error||!uuidPattern.test(data?.invite_code||''))throw Error('INVITE_NOT_AVAILABLE');
    const share=new URL('https://ekodi.kr/my/points/');
    share.searchParams.set('site','my');
    share.searchParams.set('invite',data.invite_code);
    referralLink.value=share.toString();
    referralLink.hidden=false;
    document.getElementById('copyReferralInvite').hidden=false;
    referralStatus.textContent='초대 링크를 만들었습니다. 공유만으로 포인트는 적립되지 않습니다.';
  }catch{
    referralStatus.textContent='초대 기능을 사용할 수 없습니다. 사이트별 운영 정책과 로그인 상태를 확인해 주세요.';
  }finally{button.disabled=false;}
}
async function confirmReferralInvite(){
  if(!enabled||!uuidPattern.test(inviteCode)||!sb||select.value!=='my')return;
  const button=document.getElementById('confirmReferralInvite');
  button.disabled=true;
  referralConfirmStatus.textContent='가입·인증 완료 여부를 확인하고 있습니다.';
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw Error('AUTH_REQUIRED');
    const {data,error}=await sb.rpc('ekodi_points_confirm_shared_signup',{p_code:inviteCode});
    if(error)throw error;
    if(data?.confirmed===true){
      referralConfirmStatus.textContent='신규 회원 연결이 확인되었습니다. 초대한 회원의 소액 포인트가 정책에 따라 반영되었습니다.';
      removeConfirmedInviteFromUrl();
      button.hidden=true;
      return;
    }
    if(data?.reason==='ALREADY_CREDITED'){
      referralConfirmStatus.textContent='이미 확인된 초대입니다.';
      removeConfirmedInviteFromUrl();button.hidden=true;
      return;
    }
    referralConfirmStatus.textContent='적립 조건 또는 오늘의 한도로 인해 초대가 확정되지 않았습니다.';
  }catch{
    referralConfirmStatus.textContent='가입·인증 조건을 충족하는 신규 회원만 확인할 수 있습니다. 기존 회원과 자기초대는 인정되지 않습니다.';
  }finally{button.disabled=false;}
}
document.getElementById('createReferralInvite').addEventListener('click',issueReferralInvite);
document.getElementById('confirmReferralInvite').addEventListener('click',confirmReferralInvite);
document.getElementById('copyReferralInvite').addEventListener('click',async()=>{
  if(!referralLink.value)return;
  try{await navigator.clipboard.writeText(referralLink.value);referralStatus.textContent='초대 링크를 복사했습니다. 실제 신규 회원 가입이 확인되어야 포인트가 적립됩니다.';}
  catch{referralLink.focus();referralLink.select();referralStatus.textContent='링크를 선택했습니다. 직접 복사해 주세요.';}
});

function clearPrivateView(message){
  ++viewRevision;
  view.hidden=true;
  balance.textContent='0';
  historyList.replaceChildren();
  select.disabled=true;
  select.replaceChildren(new Option('사이트 선택',''));
  login.hidden=false;
  referralSection.hidden=true;
  referralConfirmSection.hidden=true;
  referralLink.value='';referralLink.hidden=true;
  document.getElementById('copyReferralInvite').hidden=true;
  claimSection.hidden=true;claimAdapter.replaceChildren();claimList.replaceChildren();refreshPointTabState();claimStatus.textContent='';
  clearProgress();
  document.getElementById('claimForm').reset();
  showMessage(message);
}
function renderClaims(rows){
  claimList.replaceChildren();
  if(!Array.isArray(rows)||!rows.length){claimList.textContent='아직 신청한 증빙이 없습니다.';return;}
  for(const row of rows){
    const div=document.createElement('div');div.className='record';
    const summary=document.createElement('div');const label=document.createElement('strong');
    label.textContent=(ADAPTER_NAMES[row.adapter]||'활동 증빙')+' · '+String(row.source_ref||'');
    const date=document.createElement('small');date.textContent=row.submitted_at?new Date(row.submitted_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'';
    summary.append(label,date);
    const state=document.createElement('strong');state.textContent=CLAIM_STATUS[row.status]||'처리 중';
    state.className=row.status==='approved'?'positive':row.status==='rejected'?'negative':'';
    div.append(summary,state);claimList.append(div);
  }
}
async function loadClaims(site,revision){
  claimSection.hidden=true;
  if(!sb||!/^[a-z0-9_-]{2,64}$/.test(site))return;
  try{
    const [{data:options,error:optionError},{data:mine,error:mineError}]=await Promise.all([
      sb.rpc('ekodi_points_claimable_adapters',{p_site:site}),sb.rpc('ekodi_points_my_claims',{p_site:site})]);
    if(revision!==viewRevision)return;
    if(optionError||mineError)return;
    const list=Array.isArray(options)?options:[];
    if(!list.length&&!(Array.isArray(mine)&&mine.length))return;
    claimAdapter.replaceChildren();
    for(const item of list){
      const option=new Option((ADAPTER_NAMES[item.adapter]||item.adapter)+' · '+Number(item.points||0)+'P'+(item.trust==='low_trust'?' (자기신고)':''),item.rule_id+'|'+item.adapter);
      claimAdapter.add(option);
    }
    document.getElementById('claimSubmit').disabled=!list.length;
    renderClaims(mine);claimSection.hidden=false;refreshPointTabState();
  }catch{/* claim panel stays hidden; wallet view is unaffected */}
}
async function submitClaim(event){
  event.preventDefault();
  const site=select.value,revision=viewRevision;
  const [rule,adapter]=String(claimAdapter.value||'').split('|');
  const ref=document.getElementById('claimRef').value.trim();
  if(!sb||!rule||!adapter)return;
  if(!/^[A-Za-z0-9:._/-]{3,120}$/.test(ref)){claimStatus.textContent=CLAIM_ERRORS.INVALID_EVIDENCE_REF;return;}
  const button=document.getElementById('claimSubmit');button.disabled=true;
  claimStatus.textContent='증빙을 신청하고 있습니다.';
  try{
    const {data,error}=await sb.rpc('ekodi_points_submit_evidence_claim',{p_site:site,p_rule:rule,p_adapter:adapter,
      p_source_ref:ref,p_note:document.getElementById('claimNote').value.trim()});
    if(revision!==viewRevision)return;
    if(error){const code=String(error.message||'');claimStatus.textContent=CLAIM_ERRORS[code]||'신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';return;}
    claimStatus.textContent=data?.submitted?'신청했습니다. 운영자 확인 후 적립 여부가 표시됩니다.':'이미 신청한 증빙입니다.';
    document.getElementById('claimForm').reset();
    await loadClaims(site,revision);
    // A successful evidence submission changes this site's approved/pending
    // mission projection; refresh from the trusted server (never award in UI).
    if(revision===viewRevision&&select.value===site){
      const {data:{session}}=await sb.auth.getSession();
      if(revision===viewRevision&&select.value===site&&session?.access_token){
        void loadProgress(session.access_token,site,revision);
      }
    }
  }finally{button.disabled=false;}
}
document.getElementById('claimForm').addEventListener('submit',submitClaim);
async function request(path,token){
  const res=await fetch(api+path,{headers:{Authorization:'Bearer '+token,apikey:config.supabasePublishableKey},cache:'no-store'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body?.error||'points_unavailable');
  return body;
}
function renderRows(rows){
  historyList.replaceChildren();
  if(!Array.isArray(rows)||!rows.length){historyList.textContent='아직 거래 내역이 없습니다.';return;}
  const names={earn:'적립',spend:'사용',transfer_in:'전환 받음',transfer_out:'전환 보냄',donation:'포인트 기부',admin_adjustment:'운영 조정',reversal:'적립 취소'};
  for(const row of rows){
    const div=document.createElement('div');div.className='record';
    const summary=document.createElement('div');const label=document.createElement('strong');
    label.textContent=names[row.event_kind]||'포인트 거래';const date=document.createElement('small');
    date.textContent=row.created_at?new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'';
    summary.append(label,date);
    const amount=document.createElement('strong');const value=Number(row.amount)||0;
    amount.textContent=(value>0?'+':'')+value.toLocaleString('ko-KR')+' P';
    amount.className=value>=0?'positive':'negative';
    div.append(summary,amount);historyList.append(div);
  }
}
async function loadGoal(site,revision){
  if(!sb||!enabled||revision!==viewRevision)return;
  try{
    const {data,error}=await sb.rpc('ekodi_points_my_recognition_goal',{p_site:site});
    if(revision!==viewRevision||select.value!==site)return;
    if(error)throw error;
    renderGoal(data);
    goalStatus.textContent=data.configured===true?
      '저장된 나의 성취 목표입니다.':'기본 목표입니다. 저장하지 않아도 활동 기록은 유지됩니다.';
  }catch{
    if(revision!==viewRevision||select.value!==site)return;
    goalSection.hidden=true;
    goalStatus.textContent='';
  }
}
async function saveGoal(event,reset=false){
  if(event)event.preventDefault();
  const site=select.value,revision=viewRevision;
  if(!sb||!enabled||!currentProgress||!/^[a-z0-9_-]{2,64}$/.test(site))return;
  const weekly=reset?null:Number(weeklyTarget.value);
  const count=reset?null:Number(ninetyTarget.value);
  if(!reset&&(!Number.isSafeInteger(weekly)||weekly<1||weekly>7||
    !Number.isSafeInteger(count)||count<3||count>90)){
    goalStatus.textContent='주간 1~7일, 최근 90일 3~90건 범위에서 선택해 주세요.';return;
  }
  goalSave.disabled=true;goalReset.disabled=true;
  goalStatus.textContent=reset?'기본 목표로 변경하고 있습니다.':'성취 목표를 저장하고 있습니다.';
  try{
    const {data,error}=await sb.rpc('ekodi_points_set_recognition_goal',{
      p_site:site,p_weekly_days:weekly,p_target_90d:count
    });
    if(revision!==viewRevision||select.value!==site)return;
    if(error)throw error;
    renderGoal(data);
    goalStatus.textContent=reset?'기본 목표로 되돌렸습니다.':'나의 성취 목표를 저장했습니다.';
  }catch{
    if(revision===viewRevision&&select.value===site)
      goalStatus.textContent='목표를 저장하지 못했습니다. 로그인 및 사이트 운영 상태를 확인해 주세요.';
  }finally{goalSave.disabled=false;goalReset.disabled=false;}
}
goalForm.addEventListener('submit',event=>{void saveGoal(event,false);});
goalReset.addEventListener('click',()=>{void saveGoal(null,true);});
async function loadProgress(token,site,revision){
  clearProgress();
  if(!enabled||!/^[a-z0-9_-]{2,64}$/.test(site))return;
  progressSection.hidden=false;
  progressNotice.textContent='검증된 활동 정보를 불러오고 있습니다.';
  refreshPointTabState();
  try{
    const data=await request('/progress?site='+encodeURIComponent(site),token);
    if(revision!==viewRevision)return;
    renderProgress(data);
    void loadGoal(site,revision);
  }catch{
    if(revision!==viewRevision)return;
    progressContent.hidden=true;
    progressSection.hidden=false;
    progressNotice.textContent='미션 정보를 확인할 수 없습니다. 현재 사이트 운영 정책과 연결 상태를 확인해 주세요.';
    refreshPointTabState();
  }
}
async function loadWallet(token,site,revision){
  if(!/^[a-z0-9_-]{2,64}$/.test(site))return;
  try{
    showMessage('포인트 내역을 불러오고 있습니다.');
    const data=await request('/me?site='+encodeURIComponent(site),token);
    if(revision!==viewRevision)return;
    balance.textContent=Number(data.balance||0).toLocaleString('ko-KR');
    renderRows(data.history);notice.textContent='';view.hidden=false;
  }catch(e){if(revision===viewRevision)showMessage('포인트 내역을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
}
async function start(){
  const revision=++viewRevision;
  clearProgress();
  try{await handoff();}
  catch{showMessage('로그인 인계에 실패했습니다. 로그인 후 다시 시도해 주세요.');login.hidden=false;return;}
  if(revision!==viewRevision)return;
  if(!enabled){showMessage('포인트 조회 서비스 준비 중입니다.');return;}
  const {data:{session}}=await sb.auth.getSession();
  if(revision!==viewRevision)return;
  if(!session?.access_token){showMessage('로그인하면 사이트별 활동포인트를 확인할 수 있습니다.');login.hidden=false;return;}
  login.hidden=true;
  try{
    const data=await request('/sites',session.access_token);
    if(revision!==viewRevision)return;
    const sites=Array.isArray(data.sites)?data.sites:[];
    select.replaceChildren();
    if(!sites.length){select.add(new Option('현재 운영 중인 포인트 사이트가 없습니다.',''));showMessage('사이트별 포인트 운영 준비 중입니다.');return;}
    sites.forEach(site=>select.add(new Option(site.name,site.id)));
    const wanted=new URLSearchParams(location.search).get('site');
    if(wanted&&sites.some(site=>site.id===wanted))select.value=wanted;
    select.disabled=false;
    select.onchange=()=>{const next=++viewRevision;clearProgress();showReferralControls(select.value,true);void loadWallet(session.access_token,select.value,next);void loadClaims(select.value,next);void loadProgress(session.access_token,select.value,next);};
    showReferralControls(select.value,true);
    void loadClaims(select.value,revision);
    void loadProgress(session.access_token,select.value,revision);
    await loadWallet(session.access_token,select.value,revision);
  }catch(e){if(revision===viewRevision)showMessage('포인트 목록을 확인할 수 없습니다. 연결 상태를 확인해 주세요.');}
}
if(sb){
  sb.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT'){
      clearPrivateView('로그아웃되었습니다. 포인트 내역을 보려면 로그인해 주세요.');
    } else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
      queueMicrotask(()=>{void start();});
    }
  });
}
void start();
