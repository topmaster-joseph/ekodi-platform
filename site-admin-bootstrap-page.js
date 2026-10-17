// Protected site administration recovery. The page itself grants no authority;
// every read/write uses the verified first-party Google session and Access API.
export function siteAdminBootstrapPage(){
  return new Response(\`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>사이트 관리자 등록 · EKODI</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#181818;background:#f6f6f6}
*{box-sizing:border-box}body{margin:0}header,main{width:min(780px,calc(100% - 28px));margin:auto}
header{display:flex;align-items:center;justify-content:space-between;min-height:65px;border-bottom:1px solid #dadada}
a{color:inherit}main{padding:26px 0 45px}h1{font-size:25px;margin:0 0 12px}p{line-height:1.65;color:#525252}
section{background:#fff;border:1px solid #e1e1e1;border-radius:12px;padding:24px;margin-top:20px}
form{display:grid;gap:16px}label{display:grid;gap:6px;font-size:14px;font-weight:600}
input{width:100%;border:1px solid #bbb;border-radius:8px;padding:12px;font-size:16px}
button,.button{display:inline-block;text-align:center;background:#151515;color:#fff;padding:11px 17px;border:0;border-radius:8px;text-decoration:none;font-size:15px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}.subtle{font-size:13px;color:#666}
#status{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}
@media(max-width:550px){section{padding:17px}h1{font-size:21px}}
</style></head>
<body><header><strong>EKODI · 최고관리자</strong><a href="/admin/control">Control</a></header>
<main><h1>사이트 관리자 등록</h1>
<p>관리자가 없는 사이트를 최고관리자의 Google 본인 인증으로 복구합니다. Google 로그인 자체는 누구나 가능하지만 관리자 등록은 지정된 권한으로만 가능합니다.</p>
<section>
<div id="signIn"><a class="button" id="loginLink" href="#">Google 계정으로 최고관리자 인증</a></div>
<p id="status" role="status" aria-live="polite">권한 확인 중</p>
</section>
<section><form id="siteAdminForm" autocomplete="off">
<label>사이트 식별자 <input name="site" id="siteKey" required maxlength="60" pattern="[a-z0-9][a-z0-9_-]{1,59}" placeholder="church"></label>
<label>테넌트 경로(등록된 테넌트 slug) <input name="tenant" id="tenantSlug" required maxlength="80" pattern="[a-z0-9][a-z0-9_-]{1,79}" placeholder="ekodi-church"></label>
<label>신규 사이트 관리자 Google 이메일 <input name="email" id="targetEmail" type="email" required maxlength="254" placeholder="name@gmail.com"></label>
<p class="subtle">기존 관리자가 한 명이라도 활성 상태이면 등록되지 않습니다. 대상 계정은 실제 Google 본인 인증을 완료해야 권한을 사용할 수 있습니다.</p>
<button id="submitBootstrap" type="submit" disabled>관리자 공석 확인 및 등록</button>
</form></section>
</main><script src="/site-admin-bootstrap.js" defer></script></body></html>\`,{
    headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive',
      'x-frame-options':'DENY',
      'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src https://renzehysxirjilvdxacv.supabase.co; img-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"}
  });
}
export function siteAdminBootstrapScript(){
  return new Response(String.raw\`(() => {
  'use strict';
  const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
  const API=SUPABASE+'/functions/v1/access-api';
  const ANON='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const KEY='ekodi-site-admin-bootstrap-token';
  const status=document.getElementById('status');
  const login=document.getElementById('signIn');
  const submit=document.getElementById('submitBootstrap');
  const url=new URL(location.href);
  for(const [param,id] of [['site','siteKey'],['tenant','tenantSlug']]){
    const value=url.searchParams.get(param)||'';
    if(/^[a-z0-9_-]{2,80}$/.test(value))document.getElementById(id).value=value;
  }
  const auth=new URL('/auth/',location.origin);
  auth.searchParams.set('site','portal');
  auth.searchParams.set('return_to',location.origin+location.pathname+location.search);
  document.getElementById('loginLink').href=auth.href;
  let token='';
  const show=message=>{status.textContent=message;};
  async function call(path,method='GET',body=null){
    const res=await fetch(API+path,{method,headers:{
      apikey:ANON,authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})
    },body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const result=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(result.code||result.error||'HTTP '+res.status);
    return result;
  }
  async function init(){
    const fragment=new URLSearchParams(location.hash.slice(1));
    const handoff=fragment.get('ekodi_token');
    if(handoff){
      // A single-use EKODI handoff is exchanged for a Supabase session.
      history.replaceState(null,'',location.pathname+location.search);
      const r=await fetch(SUPABASE+'/auth/v1/verify',{method:'POST',
        headers:{apikey:ANON,'content-type':'application/json'},
        body:JSON.stringify({token_hash:handoff,type:fragment.get('ekodi_type')||'email'}),cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.access_token)throw new Error('Google 인증 세션 확인 실패');
      token=data.access_token;
      try{sessionStorage.setItem(KEY,token)}catch{}
    }else{try{token=sessionStorage.getItem(KEY)||''}catch{}}
    if(!token){show('등록하려면 먼저 Google 계정으로 인증하세요.');return}
    const authority=await call('/platform-authority');
    if(authority.platformAdmin!==true){show('Google 인증은 가능하지만 최고관리자 권한이 없는 계정입니다.');return}
    submit.disabled=false;login.hidden=true;
    show('최고관리자 확인 완료. 관리자가 없는 사이트에 한하여 등록할 수 있습니다.');
  }
  document.getElementById('siteAdminForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(submit.disabled)return;
    const site=document.getElementById('siteKey').value.trim().toLowerCase();
    const tenant=document.getElementById('tenantSlug').value.trim().toLowerCase();
    const email=document.getElementById('targetEmail').value.trim().toLowerCase();
    if(!confirm('관리자가 없는 사이트에 '+email+' 계정을 등록하시겠습니까?'))return;
    submit.disabled=true;show('기존 관리자와 사이트 일치를 확인하고 있습니다.');
    try{
      const data=await call('/site-admins/bootstrap','POST',{site,tenant,email});
      show(data.ok===true?'관리자 등록 기록 완료. 대상 Google 계정이 로그인하면 실제 권한을 확인할 수 있습니다.':'등록하지 못했습니다.');
    }catch(error){show(error.message==='SITE_ALREADY_HAS_ADMIN'?
      '기존 사이트 관리자가 있으므로 공석 등록이 차단되었습니다.':
      '등록 실패: '+error.message);submit.disabled=false;}
  });
  init().catch(error=>{show('인증 확인 실패: '+error.message);try{sessionStorage.removeItem(KEY)}catch{}});
})();\`,{
    headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff'}
  });
}
