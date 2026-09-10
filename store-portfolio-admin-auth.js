function portfolioAdminClient(){
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SHARED_KEY='ekodi-store-admin-session';
  const KEYS=['ekodi-cmpmyi-admin-session',SHARED_KEY,'ekodi-store-admin-session:jadam','ekodi-store-admin-session:pizzamaru','ekodi-store-admin-session:yogurt'];
  const $=id=>document.getElementById(id);
  function authUrl(){const u=new URL('/auth/',location.origin);u.searchParams.set('site','space');u.searchParams.set('return_to',location.origin+'/cmpmyi/admin');return u.href}
  function readSession(){for(const key of KEYS){try{const value=JSON.parse(sessionStorage.getItem(key)||'null');if(value?.accessToken)return value}catch{}}return null}
  function saveSession(value){sessionStorage.setItem('ekodi-cmpmyi-admin-session',JSON.stringify(value));sessionStorage.setItem(SHARED_KEY,JSON.stringify(value))}
  function clearSession(){for(const key of KEYS)sessionStorage.removeItem(key)}
  async function auth(path,options={}){const response=await fetch(SUPABASE_URL+path,{...options,headers:{apikey:SUPABASE_KEY,'content-type':'application/json',...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.msg||data.error_description||data.error||`auth_${response.status}`);return data}
  function normalize(data,current={}){return{accessToken:data.access_token||'',refreshToken:data.refresh_token||current.refreshToken||'',expiresAt:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:{id:data.user?.id||current.user?.id||'',email:data.user?.email||current.user?.email||''}}}
  async function exchange(){const params=new URLSearchParams(location.hash.slice(1));const hash=params.get('ekodi_token');if(!hash)return null;const data=await auth('/auth/v1/verify',{method:'POST',body:JSON.stringify({token_hash:hash,type:params.get('ekodi_type')||'email'})});const session=normalize(data);if(!session.accessToken)throw new Error('auth_exchange_failed');saveSession(session);history.replaceState(null,'',location.pathname+location.search);return session}
  async function validSession(session){if(!session?.accessToken)return null;const now=Math.floor(Date.now()/1000);if(Number(session.expiresAt||0)<=now+60){if(!session.refreshToken)return null;const refreshed=await auth('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refreshToken})});session=normalize(refreshed,session);saveSession(session)}const user=await auth('/auth/v1/user',{method:'GET',headers:{authorization:`Bearer ${session.accessToken}`}});session.user={id:user.id||session.user?.id||'',email:user.email||session.user?.email||''};saveSession(session);return session}
  function showLogin(message='Google 계정으로 관리자 인증을 완료해 주세요.'){$('portfolioContent').hidden=true;$('portfolioLogin').hidden=false;$('portfolioLoginLink').href=authUrl();$('portfolioLoginStatus').textContent=message;$('portfolioAuthState').textContent='로그인 필요';$('portfolioLogout').hidden=true}
  function showAdmin(session){$('portfolioLogin').hidden=true;$('portfolioContent').hidden=false;$('portfolioAuthState').textContent=session.user?.email||'관리자 인증됨';$('portfolioLogout').hidden=false}
  async function boot(){ $('portfolioLoginLink').href=authUrl(); $('portfolioLogout').onclick=()=>{clearSession();showLogin('로그아웃했습니다. 다시 로그인하면 권한을 새로 확인합니다.')}; try{let session=await exchange()||readSession();session=await validSession(session);if(session)return showAdmin(session);clearSession();showLogin()}catch(error){console.warn('CMPMYI admin auth',error);clearSession();showLogin('인증 상태를 확인하지 못했습니다. Google 계정으로 다시 로그인해 주세요.')}}
  boot();
}
export function storePortfolioAdminAuthScript(){return new Response(`(${portfolioAdminClient.toString()})()`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
