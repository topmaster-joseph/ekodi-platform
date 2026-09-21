function clientMain(){
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SESSION_KEY='ekodi-region-admin-session';
  const ADMIN_TOKEN_KEY='ekodi-auth-token';
  const root=document.documentElement;
  if(root.dataset.ekodiRegionSurface!=='admin')return;
  const path=location.pathname.replace(/\/+$/,'');
  const pass=path==='/cheonggye/admin/pass'||path.startsWith('/cheonggye/admin/pass/');
  const scope=pass?'cheonggye-pass':'cheonggye-local';

  function storedSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null}catch{return null}}
  function saveSession(value){sessionStorage.setItem(SESSION_KEY,JSON.stringify(value))}
  function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
  async function supabaseAuth(pathname,body){
    const response=await fetch(SUPABASE_URL+pathname,{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.msg||data.error_description||data.error||('auth_'+response.status)),{status:response.status});
    return data;
  }
  function normalizeSession(data,current={}){return{accessToken:data.access_token||'',refreshToken:data.refresh_token||current.refreshToken||'',expiresAt:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:{id:data.user?.id||current.user?.id||'',email:data.user?.email||current.user?.email||''}}}
  async function exchangeHandoff(){
    const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return storedSession();
    const data=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:params.get('ekodi_type')||'email'});
    const session=normalizeSession(data);if(!session.accessToken)throw new Error('login_handoff_failed');saveSession(session);history.replaceState(null,'',location.pathname+location.search);return session;
  }
  async function userToken(){
    let session=await exchangeHandoff();if(!session?.accessToken)return'';
    const now=Math.floor(Date.now()/1000);if(!session.expiresAt||session.expiresAt>now+60)return session.accessToken;
    if(!session.refreshToken){clearSession();return''}
    try{const data=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refreshToken});session=normalizeSession(data,session);saveSession(session);return session.accessToken}catch{clearSession();return''}
  }
  function authUrl(){const url=new URL('https://ekodi.kr/auth/');url.searchParams.set('site','portal');url.searchParams.set('direct','1');url.searchParams.set('return_to',location.origin+location.pathname+location.search);return url.href}
  function showMessage(title,copy,actions=[]){
    const main=document.querySelector('main')||document.body;main.style.visibility='visible';main.replaceChildren();
    const section=document.createElement('section');section.style.cssText='width:min(720px,calc(100% - 28px));margin:34px auto;padding:28px;border:1px solid #dce3e8;border-radius:22px;background:#fff;font-family:system-ui,sans-serif';
    const eyebrow=document.createElement('p');eyebrow.textContent='EKODI ACCESS';eyebrow.style.cssText='font-size:12px;font-weight:800;color:#526b7d;letter-spacing:.08em';
    const h=document.createElement('h1');h.textContent=title;h.style.cssText='font-size:28px;margin:8px 0 10px';
    const p=document.createElement('p');p.textContent=copy;p.style.cssText='color:#5e6d79;line-height:1.65';
    const host=document.createElement('div');host.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:18px';
    for(const action of actions){const a=document.createElement('a');a.href=action.href;a.textContent=action.label;a.style.cssText='display:inline-flex;padding:10px 14px;border-radius:12px;background:#172c3e;color:#fff;text-decoration:none;font-weight:750';host.append(a)}
    section.append(eyebrow,h,p,host);main.append(section);
  }
  async function check(){
    root.dataset.regionAuthPending='1';
    const platformToken=sessionStorage.getItem(ADMIN_TOKEN_KEY)||'';const token=platformToken||await userToken();
    if(!token){location.replace(authUrl());return}
    const response=await fetch('/api/local-access/'+scope+'/me',{headers:{authorization:'Bearer '+token},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){clearSession();location.replace(authUrl());return}
    if(!response.ok){showMessage('관리 권한이 없습니다',data.error||'이 이메일에는 해당 관리공간 권한이 등록되어 있지 않습니다.',[{href:pass?'/cheonggye/pass':'/cheonggye',label:'사용자 페이지'},{href:authUrl(),label:'다른 Google 계정으로 로그인'}]);root.dataset.regionAuthPending='0';return}
    root.dataset.regionAuthReady='1';root.dataset.regionAuthPending='0';root.dataset.regionRole=data.role||'';root.dataset.regionAccessScope=data.scope?.slug||scope;root.dataset.regionCanManageAccess=data.canManageAccess?'1':'0';root.dataset.regionEmail=data.email||'';
    root.__EKODI_REGION_ACCESS__=Object.freeze(data);
    document.querySelectorAll('[data-region-capability]').forEach(node=>{const cap=node.dataset.regionCapability||'';const allowed=(data.capabilities||[]).includes('*')||(data.capabilities||[]).includes(cap);node.hidden=!allowed});
    document.querySelectorAll('[data-region-auth-email]').forEach(node=>node.textContent=data.email||'');document.querySelectorAll('[data-region-auth-role]').forEach(node=>node.textContent=data.role||'');
    document.dispatchEvent(new CustomEvent('ekodi:region-access-ready',{detail:data}));
  }
  check().catch(error=>{console.error('regional admin auth',error);showMessage('인증 확인 실패','관리자 로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.',[{href:authUrl(),label:'Google 로그인'}]);root.dataset.regionAuthPending='0'});
}

export function localRegionAdminAuthScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
