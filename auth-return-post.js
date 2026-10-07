const SUPABASE_VERIFY_URL='https://renzehysxirjilvdxacv.supabase.co/auth/v1/verify';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const SUPABASE_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const ONE_TIME_TOKEN_RE=/^[A-Za-z0-9._~-]{20,2048}$/;
const AUTH_RETURN_MARKER='ekodi_auth_return';
const SENSITIVE_URL_KEYS=Object.freeze(['ekodi_token','ekodi_type','token_hash','access_token','refresh_token','code','state','nonce','ticket','auth_ticket','handoff_token']);

function scriptJson(value){
  return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
function htmlResponse(body,status=200){
  return new Response(body,{status,headers:{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store, max-age=0',
    'pragma':'no-cache',
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'x-ekodi-auth-return':'form-post-v1'
  }});
}
function errorPage(message,status){
  const safe=String(message||'로그인 복귀를 완료하지 못했습니다.').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  return htmlResponse('<!doctype html><meta charset="utf-8"><title>로그인 복귀</title><main><p>'+safe+'</p><p><a href="/">사이트로 돌아가기</a></p></main>',status);
}
async function readAuthReturnForm(request){
  const type=String(request.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('application/x-www-form-urlencoded')&&!type.includes('multipart/form-data'))return null;
  try{
    const form=await request.clone().formData();
    if(String(form.get(AUTH_RETURN_MARKER)||'')!=='1')return null;
    return form;
  }catch{return null}
}
function safeContextValue(value,max=180){const text=String(value||'').trim();return text.length<=max&&/^[A-Za-z0-9:_-]*$/.test(text)?text:''}
async function exchangeOneTimeToken(tokenHash,type,fetchImpl){
  const response=await fetchImpl(SUPABASE_VERIFY_URL,{
    method:'POST',
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},
    body:JSON.stringify({token_hash:tokenHash,type})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token)throw Object.assign(new Error(data?.error_description||data?.msg||data?.error||'auth_return_exchange_failed'),{status:response.status||502});
  return {
    access_token:String(data.access_token||''),
    refresh_token:String(data.refresh_token||''),
    expires_at:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),
    expires_in:Number(data.expires_in||3600),
    token_type:String(data.token_type||'bearer'),
    user:data.user||null
  };
}
function returnContext(form){
  const clean=(name,max=180)=>String(form.get(name)||'').trim().slice(0,max);
  return {
    workspace:clean('ekodi_workspace'),
    tenant:clean('ekodi_tenant'),
    store:clean('ekodi_store'),
    createdAt:Date.now()
  };
}
function completionPage(session,context={}){
  const sessionJson=scriptJson(session);
  const contextJson=scriptJson(context);
  const storageKey=scriptJson(SUPABASE_SESSION_KEY);
  const sensitiveKeys=scriptJson(SENSITIVE_URL_KEYS);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 복귀</title></head><body><main><p>로그인 정보를 확인하고 원래 화면으로 돌아갑니다.</p></main><script>(()=>{const session=${sessionJson},context=${contextJson},storageKey=${storageKey},sensitiveKeys=${sensitiveKeys};const clean=new URL(location.href);for(const key of sensitiveKeys)clean.searchParams.delete(key);if(clean.hash){const raw=clean.hash.slice(1),hashParams=new URLSearchParams(raw);let changed=false;for(const key of sensitiveKeys){if(hashParams.has(key)){hashParams.delete(key);changed=true}}if(changed)clean.hash=hashParams.toString()?'#'+hashParams.toString():''}history.replaceState(null,'',clean.pathname+clean.search+clean.hash);try{localStorage.setItem(storageKey,JSON.stringify(session));sessionStorage.setItem('ekodi-auth-token',session.access_token||'');if(context.workspace||context.tenant||context.store)sessionStorage.setItem('ekodi-auth-return-context',JSON.stringify(context))}catch{}location.replace(clean.href)})()</script></body></html>`;
}

export async function handleAuthReturnPost(request,{fetchImpl=fetch}={}){
  if(String(request?.method||'').toUpperCase()!=='POST')return null;
  const form=await readAuthReturnForm(request);
  if(!form)return null;
  const tokenHash=String(form.get('ekodi_token')||form.get('token_hash')||'').trim();
  const type=String(form.get('ekodi_type')||'email').trim().toLowerCase();
  const context={workspace:safeContextValue(form.get('ekodi_workspace')),tenant:safeContextValue(form.get('ekodi_tenant')),store:safeContextValue(form.get('ekodi_store'))};
  if(!ONE_TIME_TOKEN_RE.test(tokenHash))return errorPage('로그인 복귀 인증값이 올바르지 않습니다.',400);
  if(type!=='email')return errorPage('지원하지 않는 로그인 복귀 유형입니다.',400);
  try{
    const session=await exchangeOneTimeToken(tokenHash,type,fetchImpl);
    return htmlResponse(completionPage(session,returnContext(form)),200);
  }catch(error){
    console.error('EKODI auth return form-post exchange failed',{status:Number(error?.status||0),path:new URL(request.url).pathname});
    return errorPage('로그인 복귀를 완료하지 못했습니다. 다시 로그인해 주세요.',Number(error?.status)>=400&&Number(error?.status)<600?Number(error.status):502);
  }
}

export const AUTH_RETURN_URL_HYGIENE=Object.freeze({
  policyId:'AUTH-RETURN-URL-HYGIENE-001',
  marker:AUTH_RETURN_MARKER,
  transport:'form-post',
  oneTimeCredentialInAddressBar:false,
  sensitiveUrlKeys:SENSITIVE_URL_KEYS,
  sessionStorageKey:SUPABASE_SESSION_KEY
});
