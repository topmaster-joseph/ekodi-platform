import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const config=window.EKODI_MY_CONFIG||{};
const select=document.getElementById('siteSelect');
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
async function handoff(){
  if(!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return;
  try{
    if(!sb)return;
    const type=params.get('ekodi_type')||'email';
    const {error}=await sb.auth.verifyOtp({token_hash:token,type});
    if(error)throw error;
  } finally {
    window.history.replaceState({},document.title,location.pathname+location.search);
  }
}
function showMessage(text){notice.textContent=text;view.hidden=true;}
function showReferralControls(site,authorized){
  const active=enabled&&authorized===true&&site==='my';
  referralSection.hidden=!active;
  referralConfirmSection.hidden=!active||!uuidPattern.test(inviteCode);
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
  showMessage(message);
}
async function request(path,token){
  const res=await fetch(api+path,{headers:{Authorization:'Bearer '+token,apikey:config.supabasePublishableKey},cache:'no-store'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body?.error||'points_unavailable');
  return body;
}
function renderRows(rows){
  historyList.replaceChildren();
  if(!Array.isArray(rows)||!rows.length){historyList.textContent='아직 거래 내역이 없습니다.';return;}
  const names={earn:'적립',spend:'사용',transfer_in:'전환 받음',transfer_out:'전환 보냄',donation:'포인트 기부'};
  for(const row of rows){
    const div=document.createElement('div');div.className='record';
    const summary=document.createElement('div');const label=document.createElement('strong');
    label.textContent=names[row.event_kind]||'포인트 거래';const date=document.createElement('small');
    date.textContent=row.created_at?new Date(row.created_at).toLocaleString('ko-KR'):'';
    summary.append(label,date);
    const amount=document.createElement('strong');const value=Number(row.amount)||0;
    amount.textContent=(value>0?'+':'')+value.toLocaleString('ko-KR')+' P';
    amount.className=value>=0?'positive':'negative';
    div.append(summary,amount);historyList.append(div);
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
    select.onchange=()=>{const next=++viewRevision;showReferralControls(select.value,true);void loadWallet(session.access_token,select.value,next);};
    showReferralControls(select.value,true);
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
