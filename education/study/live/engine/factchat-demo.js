// Instructor-only live demo through the 국립목포대학교 FactChat institutional account.
// The key never reaches the browser: the request goes to EKODI's existing server route, which enforces
// Super Administrator sign-in, the institutional-use approval switch, a daily call limit and an audit log.
// The presenter signs in through EKODI central admin auth; the token lands in this tab's sessionStorage
// (same key the admin console uses) and is never written to the shared classroom state.
export const ADMIN_TOKEN_KEY='ekodi-auth-token';
export const PLAYGROUND_URL='https://ekodi.kr/api/ai-modules/v1/providers/admin/factchat-institution/playground';
export const DEMO_SYSTEM='당신은 국립목포대학교 교직원 대상 FactChat 실습 강의의 시연용 AI입니다. 한국어로 답하고, 주어진 자료에 없는 정보는 지어내지 말고 [확인 필요]로 표시하세요.';
const ERRORS=Object.freeze({
  institution_account_super_admin_required:'기관계정은 최고관리자만 사용할 수 있습니다.',
  institution_account_approval_required:'기관계정 사용 승인이 꺼져 있습니다. 관리자 › AI 운영센터 › 연결에서 승인하세요.',
  institution_account_disabled:'기관계정이 꺼져 있습니다. 관리자 › AI 운영센터 › 연결에서 켜 주세요.',
  secret_not_configured:'기관계정 API Key가 연결되지 않았습니다.',
  institution_daily_limit_reached:'오늘 기관계정 호출 한도에 도달했습니다.',
  input_required:'실행할 프롬프트를 입력하세요.'
});
export function readToken(win){try{return win.sessionStorage.getItem(ADMIN_TOKEN_KEY)||'';}catch{return '';}}
export function clearToken(win){try{win.sessionStorage.removeItem(ADMIN_TOKEN_KEY);}catch{}}
// Central auth returns with #ekodi_admin_token=… ; keep it in this tab and remove it from the address bar.
export function acceptAdminHandoff(win){
  const hash=new URLSearchParams(String(win.location.hash||'').replace(/^#/,''));
  const value=hash.get('ekodi_admin_token');
  if(!value)return false;
  try{win.sessionStorage.setItem(ADMIN_TOKEN_KEY,value);}catch{return false;}
  try{win.history.replaceState(null,'',win.location.pathname+win.location.search);}catch{}
  return true;
}
// Only the canonical apex can receive the admin handoff (the auth allowlist names the exact presenter paths).
export function adminLoginUrl(win){
  if(win.location.hostname!=='ekodi.kr')return '';
  const back=new URL(win.location.href);back.hash='';
  const u=new URL('https://ekodi.kr/auth/');
  u.searchParams.set('site','admin');u.searchParams.set('direct','1');u.searchParams.set('return_to',back.href);
  return u.href;
}
export async function runInstitutionDemo(win,input,{fetchImpl=win.fetch.bind(win)}={}){
  const token=readToken(win);
  if(!token)return {ok:false,login:true,message:'최고관리자 로그인이 필요합니다.'};
  let res,data={};
  try{
    res=await fetchImpl(PLAYGROUND_URL,{method:'POST',cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-ekodi-confirm-impact':'factchat-institution-playground'},
      body:JSON.stringify({input:String(input||'').slice(0,8000),system:DEMO_SYSTEM,maxOutputTokens:1536})});
    data=await res.json().catch(()=>({}));
  }catch{return {ok:false,message:'네트워크 오류로 실행하지 못했습니다. 잠시 후 다시 시도하세요.'};}
  if(res.status===401){clearToken(win);return {ok:false,login:true,message:'로그인이 만료되었습니다. 다시 로그인하세요.'};}
  if(!res.ok||!data.ok){const code=String(data.error||data.code||res.status);return {ok:false,message:ERRORS[code]||('기관계정 호출 실패: '+code)};}
  return {ok:true,text:String(data.text||''),model:String(data.model||''),units:'입력 '+(data.usage?.inputUnits??0)+' · 출력 '+(data.usage?.outputUnits??0)+' 토큰'};
}
