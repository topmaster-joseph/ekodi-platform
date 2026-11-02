const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API=SUPABASE_URL+'/functions/v1/church-member-giving-api';
const SESSION_KEY='ekodi-church-member-session-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=v=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Number(v||0))+'원';
let session=null;
let current=null;

function normalize(raw,currentSession={}){
  const user=raw?.user||currentSession.user||{};
  return{accessToken:raw?.access_token||raw?.accessToken||currentSession.accessToken||'',refreshToken:raw?.refresh_token||raw?.refreshToken||currentSession.refreshToken||'',expiresAt:Number(raw?.expires_at||raw?.expiresAt||0)||Math.floor(Date.now()/1000)+Number(raw?.expires_in||3600),user:{id:user.id||'',email:user.email||''}};
}
function stored(){
  try{
    const own=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    if(own?.accessToken)return own;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';if(!/^sb-.*-auth-token$/.test(key))continue;
      const raw=JSON.parse(localStorage.getItem(key)||'null');
      const candidate=raw?.currentSession||raw?.session||raw;
      if(candidate?.access_token)return normalize(candidate);
    }
  }catch{}
  return null;
}
function save(value){session=value;localStorage.setItem(SESSION_KEY,JSON.stringify(value));}
async function authRequest(path,body){
  const response=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error_description||data.msg||data.error||'로그인 확인 실패');
  return data;
}
async function consumeHandoff(){
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');if(!token)return null;
  const data=await authRequest('/auth/v1/verify',{token_hash:token,type:params.get('ekodi_type')||'email'});
  const next=normalize(data);if(!next.accessToken)throw new Error('로그인 연결에 실패했습니다.');
  save(next);history.replaceState(null,'',location.pathname+location.search);return next;
}
async function validSession(){
  let value=session||stored();if(!value?.accessToken)return null;
  if(!value.expiresAt||value.expiresAt>Math.floor(Date.now()/1000)+60){session=value;return value;}
  if(!value.refreshToken)return null;
  try{const data=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:value.refreshToken});value=normalize(data,value);save(value);return value;}catch{return null;}
}
function loginHref(){
  const target=location.origin+location.pathname;
  return 'https://ekodi.kr/auth/?site=church&direct=1&return_to='+encodeURIComponent(target);
}
async function api(options={}){
  const active=await validSession();if(!active)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401});
  const year=$('year').value;
  const url=options.method==='POST'?API:API+'?year='+encodeURIComponent(year);
  const response=await fetch(url,{method:options.method||'GET',headers:{authorization:'Bearer '+active.accessToken,'content-type':'application/json'},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'헌금 정보를 불러오지 못했습니다.'),{status:response.status});
  return data;
}
function setState(text,error=false){$('state').textContent=text;$('state').classList.toggle('error',error);}
function setupYears(){
  const currentYear=new Date().getFullYear();
  for(let year=currentYear;year>=currentYear-5;year--){const option=document.createElement('option');option.value=String(year);option.textContent=year+'년';$('year').append(option);}
}
function receiptLabel(value){return({requested:'신청됨',review:'검토 중',issued:'발급 처리됨',rejected:'반려됨'})[value]||'신청 전';}
function render(data){
  current=data;
  if(!data.linked){
    $('memberName').textContent='연결 필요';$('total').textContent='-';$('count').textContent='-';
    $('givingList').innerHTML='<p class="empty">로그인 계정과 교인명부가 아직 연결되지 않았습니다. 교인명부의 이메일 확인이 필요합니다.</p>';
    $('receiptStatus').textContent='연결 필요';$('requestReceipt').disabled=true;
    setState('교인정보 연결이 필요합니다.',true);return;
  }
  const items=Array.isArray(data.offerings)?data.offerings:[];
  $('memberName').textContent=data.member?.name||'-';$('total').textContent=won(data.total);$('count').textContent=items.length+'건';
  $('givingList').innerHTML=items.length?'<table><thead><tr><th>일자</th><th>구분</th><th>방법</th><th>금액</th></tr></thead><tbody>'+items.map(item=>'<tr><td>'+esc(item.offered_on)+'</td><td>'+esc(({tithe:'십일조',sunday:'주일헌금',thanksgiving:'감사헌금',mission:'선교헌금',building:'건축헌금',designated:'지정헌금',other:'기타헌금'})[item.offering_type]||item.offering_type)+'</td><td>'+esc(({cash:'현금',bank:'계좌',card:'카드',other:'기타'})[item.method]||item.method)+'</td><td><strong>'+esc(won(item.amount))+'</strong></td></tr>').join('')+'</tbody></table>':'<p class="empty">선택한 연도에 연결된 헌금 기록이 없습니다.</p>';
  const request=data.receipt_request||null;
  $('receiptStatus').textContent=receiptLabel(request?.status);
  $('requestReceipt').disabled=Boolean(request&&request.status!=='rejected');
  $('requestReceipt').textContent=request&&request.status!=='rejected'?'요청 완료':'발급 요청';
  $('receiptCopy').textContent=request?.status==='issued'?'발급 처리 상태입니다. 실제 증빙 전달 여부는 교회 재정부에서 확인할 수 있습니다.':'선택한 연도의 발급을 재정부에 요청합니다.';
  setState((data.member?.name||'교인')+'님의 '+data.tax_year+'년 헌금내역입니다.');
}
async function load(){
  try{setState('헌금내역을 불러오고 있습니다.');render(await api());}
  catch(error){if(error.status===401){$('app').hidden=true;$('login').hidden=false;$('login').href=loginHref();setState('로그인이 필요합니다.',true);}else setState(error.message,true);}
}
async function requestReceipt(){
  if(!current?.linked)return;
  try{$('requestReceipt').disabled=true;setState('영수증 발급 요청을 등록하고 있습니다.');await api({method:'POST',body:{action:'request_receipt',taxYear:Number($('year').value)}});await load();}
  catch(error){setState(error.message,true);$('requestReceipt').disabled=false;}
}
async function boot(){
  setupYears();$('login').href=loginHref();
  try{session=await consumeHandoff()||await validSession();}catch(error){setState(error.message,true);}
  if(!session){$('login').hidden=false;setState('로그인하면 본인의 헌금내역을 확인할 수 있습니다.');return;}
  $('app').hidden=false;$('login').hidden=true;await load();
}
$('year').addEventListener('change',()=>void load());
$('reload').addEventListener('click',()=>void load());
$('requestReceipt').addEventListener('click',()=>void requestReceipt());
void boot();
