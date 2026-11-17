/* Central EKODI identity handoff for the independent Education instructor session. */
(()=>{
'use strict';
const base=location.pathname.startsWith('/edu/')?'/edu':'';
const authUrl='https://ekodi.kr/auth/';
const sb='https://renzehysxirjilvdxacv.supabase.co';
const pub='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const key='sb-'+new URL(sb).hostname.split('.')[0]+'-auth-token';
const status=document.getElementById('signStatus');
const say=t=>{if(status)status.textContent=t;};
const adminButton=document.getElementById('superAdminSignIn');
const instructorButton=document.getElementById('instructorSignIn');
const redirect=()=>{const p=new URL(location.href);p.hash='';return p.href;};
function centralLogin(site){
 const link=new URL(authUrl);
 link.searchParams.set('site',site);
 if(site==='admin')link.searchParams.set('direct','1');
 link.searchParams.set('return_to',redirect());
 location.assign(link.toString());
}
function instructorToken(){
 try{
  const entry=JSON.parse(localStorage.getItem(key)||'null');
  const session=entry?.currentSession||entry;
  const expires=Number(session?.expires_at||0)*1000;
  return session?.access_token&&(!expires||expires>Date.now()+30000)?session.access_token:'';
 }catch{return '';}
}
async function verifyHandoff(hash){
 const tokenHash=hash.get('ekodi_token');
 if(!tokenHash)return '';
 const r=await fetch(sb+'/auth/v1/verify',{method:'POST',headers:{apikey:pub,'content-type':'application/json'},body:JSON.stringify({type:hash.get('ekodi_type')||'email',token_hash:tokenHash})});
 const session=await r.json().catch(()=>null);
 if(!r.ok||!session?.access_token)throw Error('에코디 로그인 확인에 실패했습니다.');
 if(!session.expires_at&&session.expires_in)session.expires_at=Math.floor(Date.now()/1000)+Number(session.expires_in);
 try{localStorage.setItem(key,JSON.stringify(session));}catch{}
 return session.access_token;
}
async function signIn(mode,token){
 if(!token){centralLogin(mode);return;}
 const options={method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(mode==='admin'?{}:{accessToken:token})};
 if(mode==='admin')options.headers.authorization='Bearer '+token;
 say('계정과 강사 권한을 서버에서 확인하고 있습니다.');
 try{
  const r=await fetch(base+'/teach/access',options);
  const d=await r.json().catch(()=>({}));
  if(r.ok&&d.ok){location.replace(base+'/teach/');return;}
  say(d.message||'등록된 강사 권한을 확인하지 못했습니다. 최고관리자의 이메일 등록이 필요합니다.');
 }catch{say('인증 서버에 접속하지 못했습니다. 다시 시도해 주세요.');}
}
function adminToken(){try{return sessionStorage.getItem('ekodi-auth-token')||'';}catch{return '';}}
instructorButton?.addEventListener('click',()=>signIn('edu',instructorToken()));
adminButton?.addEventListener('click',()=>signIn('admin',adminToken()));
const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
const admin=hash.get('ekodi_admin_token'),instructor=hash.get('ekodi_token');
if(admin||instructor){
 try{history.replaceState(null,'',location.pathname+location.search);}catch{}
 if(admin){
  try{sessionStorage.setItem('ekodi-auth-token',admin);}catch{}
  signIn('admin',admin);
 }else verifyHandoff(hash).then(token=>signIn('edu',token)).catch(e=>say(e.message||'로그인 확인 실패'));
}
})();