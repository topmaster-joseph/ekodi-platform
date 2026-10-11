import { mountPresenceOperator } from '/ekodimission/assets/presence-operator.js';

const URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API=URL+'/functions/v1/presence-attendance-api';
const LOGIN='https://ekodi.kr/auth/?site=mission&direct=1&return_to='+encodeURIComponent(location.origin+location.pathname);
const $=s=>document.querySelector(s);
$('#login').href=LOGIN;

function sessionFromStorage(){
  try{
    for(const key of ['ekodimission-member-session-v1','ekodimission-pastor-session']){
      const v=JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'null');
      if(v?.accessToken)return v;
    }
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!/^sb-.*-auth-token$/.test(key))continue;
      const raw=JSON.parse(localStorage.getItem(key)||'null');
      const s=raw?.currentSession||raw?.session||raw;
      if(s?.access_token)return s;
    }
  }catch{}
  return null;
}
function tokenValue(s){return String(s?.access_token||s?.accessToken||'');}
function expiry(s){return Number(s?.expires_at||s?.expiresAt||0);}
function refreshValue(s){return String(s?.refresh_token||s?.refreshToken||'');}
async function currentToken(){
  const s=sessionFromStorage();if(!s){try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return ''}}
  if(expiry(s)&&expiry(s)<Math.floor(Date.now()/1000)+60){
    const refresh=refreshValue(s);if(!refresh)return '';
    const response=await fetch(URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:PUBLISHABLE,'content-type':'application/json'},body:JSON.stringify({refresh_token:refresh}),cache:'no-store'
    });
    if(!response.ok)return '';
    const next=await response.json();
    localStorage.setItem('ekodimission-member-session-v1',JSON.stringify({accessToken:next.access_token,refreshToken:next.refresh_token,expiresAt:next.expires_at,user:next.user}));
    return String(next.access_token||'');
  }
  return tokenValue(s);
}
async function consumeHandoff(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const tokenHash=fragment.get('ekodi_token');
  if(!tokenHash)return;
  // Remove one-time credentials from the address before the network request.
  history.replaceState(null,'',location.pathname+location.search);
  const response=await fetch(URL+'/auth/v1/verify',{
    method:'POST',headers:{apikey:PUBLISHABLE,'content-type':'application/json'},
    body:JSON.stringify({token_hash:tokenHash,type:fragment.get('ekodi_type')||'email'}),cache:'no-store'
  });
  if(!response.ok)throw new Error('인증 연결에 실패했습니다.');
  const s=await response.json();
  if(!s.access_token)throw new Error('유효한 로그인 세션이 없습니다.');
  localStorage.setItem('ekodimission-member-session-v1',JSON.stringify({
    accessToken:s.access_token,refreshToken:s.refresh_token,expiresAt:s.expires_at,user:s.user
  }));
}
async function connect(){
  const target=$('#operator'),access=$('#access'),login=$('#login');
  await consumeHandoff();
  const token=await currentToken();
  if(!token){login.hidden=false;access.textContent='로그인이 필요합니다.';return;}
  const response=await fetch(API+'?tenant=ekodimission',{
    headers:{apikey:PUBLISHABLE,authorization:'Bearer '+token},cache:'no-store'
  }).catch(()=>null);
  if(!response){access.textContent='현재 출결 서비스를 연결할 수 없습니다.';return;}
  if(response.status===401){login.hidden=false;access.textContent='로그인이 만료됐습니다. 다시 로그인하세요.';return;}
  if(response.status===403){access.textContent='현재 계정은 출결 관리 권한이 없습니다.';return;}
  if(!response.ok){access.textContent='출결 데이터 연결을 확인하는 중입니다. (HTTP '+response.status+')';return;}
  access.textContent='관리자 권한 확인 완료';
  target.hidden=false;
  mountPresenceOperator(target,{tenant:'ekodimission',getToken:currentToken,apiUrl:API});
}
connect().catch(()=>{$('#access').textContent='출결 관리 화면을 불러오지 못했습니다.';});