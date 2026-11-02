const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API=SUPABASE_URL+'/functions/v1/church-member-attendance-api';
const SESSION_KEY='ekodi-church-member-session-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null;

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
async function api(){
  const active=await validSession();if(!active)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401});
  const year=$('year').value;
  const response=await fetch(API+'?year='+encodeURIComponent(year),{headers:{authorization:'Bearer '+active.accessToken,'content-type':'application/json'},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'출결 정보를 불러오지 못했습니다.'),{status:response.status});
  return data;
}
function setState(text,error=false){$('state').textContent=text;$('state').classList.toggle('error',error);}
function setupYears(){
  const currentYear=new Date().getFullYear();
  for(let year=currentYear;year>=currentYear-5;year--){const option=document.createElement('option');option.value=String(year);option.textContent=year+'년';$('year').append(option);}
}
function stateLabel(value){return({present:'출석',late:'지각',online:'온라인',absent:'결석',excused:'인정결석'})[value]||value||'-';}
function render(data){
  if(!data.linked){
    $('memberName').textContent='연결 필요';
    for(const id of ['recorded','attended','rate','presentCount','lateCount','onlineCount','absentCount','excusedCount','currentStreak','longestStreak','lastAttended','lastAbsent'])$(id).textContent='-';
    $('attendanceList').innerHTML='<p class="empty">로그인 계정과 교인명부가 아직 연결되지 않았습니다. 교인명부의 이메일 확인이 필요합니다.</p>';
    setState('교인정보 연결이 필요합니다.',true);return;
  }
  const items=Array.isArray(data.attendance)?data.attendance:[];
  $('memberName').textContent=data.member?.name||'-';
  $('recorded').textContent=Number(data.recorded_count||0)+'건';
  $('attended').textContent=Number(data.attended_count||0)+'건';
  $('rate').textContent=data.attendance_rate===null||data.attendance_rate===undefined?'-':Number(data.attendance_rate).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
  $('presentCount').textContent=Number(data.present_count||0);
  $('lateCount').textContent=Number(data.late_count||0);
  $('onlineCount').textContent=Number(data.online_count||0);
  $('absentCount').textContent=Number(data.absent_count||0);
  $('excusedCount').textContent=Number(data.excused_count||0);
  $('currentStreak').textContent=Number(data.current_streak||0)+'회';
  $('longestStreak').textContent=Number(data.longest_streak||0)+'회';
  $('lastAttended').textContent=data.last_attended_date||'-';
  $('lastAbsent').textContent=data.last_absence_date||'-';
  const monthly=Array.isArray(data.monthly)?data.monthly:[];
  $('monthlyTrend').innerHTML=monthly.length?monthly.map(item=>{
    const rate=item.attendance_rate===null||item.attendance_rate===undefined?null:Number(item.attendance_rate);
    const width=rate===null?0:Math.max(0,Math.min(100,rate));
    return '<article class="month-row"><div><strong>'+esc(item.month)+'월</strong><span>'+Number(item.attended_count||0)+' / '+Number(item.recorded_count||0)+'회</span></div><progress class="month-meter" max="100" value="'+width+'" aria-label="'+esc(item.month)+'월 출석률"></progress><b>'+(rate===null?'-':esc(rate.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%'))+'</b></article>';
  }).join(''):'<p class="empty">선택한 연도에 저장된 월별 출결 기록이 없습니다.</p>';
  $('attendanceList').innerHTML=items.length?'<table><thead><tr><th>날짜</th><th>예배·모임</th><th>상태</th><th>확인</th></tr></thead><tbody>'+items.map(item=>'<tr><td>'+esc(item.service_date)+'</td><td><strong>'+esc(item.service_title)+'</strong></td><td><span class="badge '+(['present','late','online'].includes(item.attendance_state)?'ok':'')+'">'+esc(stateLabel(item.attendance_state))+'</span></td><td>'+esc(item.check_in_at?String(item.check_in_at).replace('T',' ').slice(0,16):'-')+'</td></tr>').join('')+'</tbody></table>':'<p class="empty">선택한 연도에 저장된 출결 기록이 없습니다.</p>';
  setState((data.member?.name||'교인')+'님의 '+data.year+'년 출결현황입니다. 연속출석과 출석률은 실제 기록만 기준으로 하며 미기록 예배는 결석으로 계산하지 않습니다.');
}
async function load(){
  try{setState('출결현황을 불러오고 있습니다.');render(await api());}
  catch(error){if(error.status===401){$('app').hidden=true;$('login').hidden=false;$('login').href=loginHref();setState('로그인이 필요합니다.',true);}else setState(error.message,true);}
}
async function boot(){
  setupYears();$('login').href=loginHref();
  try{session=await consumeHandoff()||await validSession();}catch(error){setState(error.message,true);}
  if(!session){$('login').hidden=false;setState('로그인하면 본인의 출결현황을 확인할 수 있습니다.');return;}
  $('app').hidden=false;$('login').hidden=true;await load();
}
$('year').addEventListener('change',()=>void load());
$('reload').addEventListener('click',()=>void load());
void boot();
