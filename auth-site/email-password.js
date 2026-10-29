// EMAIL-ID-001: EKODI Mail verification and password login, independent of
// provider-owned channel accounts. Nothing renders until server confirms all
// operational release gates. Supabase Auth owns password storage and delivery.
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const READINESS=SUPABASE_URL+'/functions/v1/identity-api/email/readiness';
const ORIGIN='https://ekodi.kr';

export function emailPasswordMode(raw){
  const value=String(raw||'').trim().toLowerCase();
  return ['login','signup','verify','reset'].includes(value)?value:'login';
}
export function authReturnPath(search){
  const q=new URLSearchParams(search);
  q.delete('ekodi_email_action');
  q.delete('ekodi_email_mode');
  return '/auth/'+(q.size?'?'+q.toString():'');
}
// EMAIL-ID-001: successful password/OTP login intentionally reloads /auth/ so
// the pre-existing central session handoff can run. That one verified
// transition is NOT a login loop. Reset only its exact navigation guard, and
// only after Supabase Auth returned a verified session; the global loop guard
// stays in place for all unrelated or failed navigations.
export function verifiedEmailReturnGuardKey(search){
  const q=new URLSearchParams(search);
  const site=q.get('site')||'portal';
  const returnTo=q.get('return_to')||q.get('returnTo')||'';
  return `ekodi-auth-entry:${site}:${returnTo}`;
}
function resumeAfterVerifiedEmailSession(){
  try{sessionStorage.removeItem(verifiedEmailReturnGuardKey(location.search));}catch{}
  location.replace(authReturnPath(location.search));
}
function node(tag,text,cls){
  const el=document.createElement(tag);
  if(text)el.textContent=text;
  if(cls)el.className=cls;
  return el;
}
function emailError(error){
  const msg=String(error?.message||'');
  if(/invalid login credentials|email not confirmed|invalid.*otp|token.*expired/i.test(msg))
    return '인증정보가 일치하지 않거나 만료되었습니다. 다시 확인해 주세요.';
  if(/rate limit|too many|429/i.test(msg))return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  return '요청을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.';
}
function validEmail(email){
  return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// Keep password recovery separate from normal Auth client listeners: a
// recovery OTP creates a temporary Supabase session before updateUser runs.
// Normal client-auth listeners could otherwise navigate to a service first.
export function isolatedRecoveryPath(search){
  const url=new URL(authReturnPath(search),ORIGIN);
  url.searchParams.set('ekodi_email_action','reset');
  return url.pathname+url.search;
}
function emailReturnUrl(){
  const to=new URL('/auth/',ORIGIN);
  // Signup email links must return to the same, canonical Auth origin.
  // The auth router will re-check site and return_to against its allowlist.
  const input=new URLSearchParams(location.search);
  for(const key of ['site','return_to','workspace']){
    const value=input.get(key);
    if(value)to.searchParams.set(key,value);
  }
  return to.toString();
}
export async function mountEmailPassword({resetOnly=false}={}){
  const host=document.getElementById('signedOut');
  if(!host||document.getElementById('ekodiEmailPassword'))return false;
  let response;
  try{
    response=await fetch(READINESS,{method:'GET',headers:{apikey:PUBLISHABLE_KEY},cache:'no-store',signal:AbortSignal.timeout(6500)});
  }catch{return false}
  if(!response.ok)return false;
  const readiness=await response.json().catch(()=>({}));
  if(readiness.enabled!==true)return false;
  let createClient;
  try{({createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'));}
  catch{return false}
  const supabase=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
    auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}
  });
  const panel=node('section','','ekodi-email-password');
  panel.id='ekodiEmailPassword';
  panel.setAttribute('aria-label','이메일·비밀번호 EKODI 로그인');
  const tabs=node('div','','ekodi-email-tabs');
  const loginTab=node('button','이메일 로그인');
  const signupTab=node('button','이메일 가입');
  const codeTab=node('button','인증코드 확인');
  for(const tab of [loginTab,signupTab,codeTab])tab.type='button';
  tabs.append(loginTab,signupTab,codeTab);
  const form=node('form','','ekodi-email-form');
  form.noValidate=true;
  const label=(title,input)=>{
    const wrap=node('label','', 'ekodi-email-field');
    wrap.append(node('span',title),input);
    return wrap;
  };
  const email=node('input');email.type='email';email.name='email';email.autocomplete='email';email.required=true;email.maxLength=254;email.placeholder='이메일 주소';
  const password=node('input');password.type='password';password.name='password';password.autocomplete='current-password';password.required=true;password.minLength=12;password.placeholder='비밀번호 (12자 이상)';
  const otp=node('input');otp.type='text';otp.name='code';otp.autocomplete='one-time-code';otp.inputMode='numeric';otp.maxLength=8;otp.placeholder='메일로 받은 6자리 인증코드';
  const passwordField=label('비밀번호',password);
  const codeField=label('메일 인증코드',otp);
  const emailField=label('이메일',email);
  const submit=node('button','이메일 로그인','ekodi-email-submit');submit.type='submit';
  const secondary=node('button','비밀번호 찾기','ekodi-email-secondary');secondary.type='button';
  const hint=node('p','본인 확인 메일은 EKODI Mail 명의로 발송됩니다.','ekodi-email-hint');
  const status=node('p','','ekodi-email-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(emailField,passwordField,codeField,submit,secondary,hint,status);
  panel.append(tabs,form);
  const anchor=document.getElementById('federatedButtonHost');
  if(anchor?.parentElement===host)anchor.after(panel);
  else host.append(panel);
  let mode=resetOnly?'reset':emailPasswordMode(new URLSearchParams(location.search).get('ekodi_email_mode'));
  let busy=false;
  function setMode(next){
    mode=emailPasswordMode(next);
    tabs.hidden=resetOnly;
    passwordField.hidden=mode==='verify';
    codeField.hidden=!['verify','reset'].includes(mode);
    if(mode==='reset')password.autocomplete='new-password';
    else password.autocomplete=mode==='signup'?'new-password':'current-password';
    loginTab.setAttribute('aria-pressed',String(mode==='login'));
    signupTab.setAttribute('aria-pressed',String(mode==='signup'));
    codeTab.setAttribute('aria-pressed',String(mode==='verify'));
    submit.textContent={login:'이메일 로그인',signup:'인증메일 보내고 가입',verify:'인증코드 확인',reset:'인증코드 확인 후 비밀번호 변경'}[mode];
    secondary.textContent=mode==='reset'?'재설정 메일 보내기':mode==='verify'?'인증메일 다시 보내기':'비밀번호 찾기';
    hint.textContent=mode==='verify'?'받은 메일의 인증코드를 입력하세요. 확인 전에는 로그인할 수 없습니다.':
      mode==='reset'?'인증코드를 받은 뒤 새 비밀번호와 함께 입력하세요.':
      'EKODI ID는 자동으로 발급됩니다. 이메일과 비밀번호만 준비하세요.';
    status.textContent='';
  }
  function message(text){status.textContent=text;}
  async function submitRequest(event){
    event.preventDefault();
    if(busy)return;
    const address=String(email.value||'').trim().toLowerCase();
    const secret=password.value;
    if(!validEmail(address)){message('올바른 이메일 주소를 입력해 주세요.');return;}
    if(mode!=='verify'&&secret.length<12){message('비밀번호는 12자 이상으로 설정해 주세요.');return;}
    if((mode==='verify'||mode==='reset')&&!/^\d{6,8}$/.test(otp.value.trim())){
      message('메일의 숫자 인증코드를 입력해 주세요.');return;
    }
    busy=true;submit.disabled=true;
    try{
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:address,password:secret,
          options:{emailRedirectTo:emailReturnUrl()}});
        if(error)throw error;
        // A production Auth server with email confirmation accidentally disabled
        // MUST NOT silently turn an unverified signup into an authenticated login.
        if(data?.session){
          await supabase.auth.signOut({scope:'local'}).catch(()=>{});
          throw new Error('email_confirmation_not_enforced');
        }
        setMode('verify');
        message('인증메일을 보냈습니다. 메일에 적힌 코드를 입력해 주세요.');
      }else if(mode==='verify'){
        const {error}=await supabase.auth.verifyOtp({email:address,token:otp.value.trim(),type:'signup'});
        if(error)throw error;
        password.value='';otp.value='';
        resumeAfterVerifiedEmailSession();
      }else if(mode==='login'){
        const {data,error}=await supabase.auth.signInWithPassword({email:address,password:secret});
        if(error)throw error;
        if(!data?.user?.email_confirmed_at)throw new Error('email_not_confirmed');
        password.value='';
        resumeAfterVerifiedEmailSession();
      }else{
        const {error:verifyError}=await supabase.auth.verifyOtp({email:address,token:otp.value.trim(),type:'recovery'});
        if(verifyError)throw verifyError;
        const {error:changeError}=await supabase.auth.updateUser({password:secret});
        if(changeError)throw changeError;
        await supabase.auth.signOut({scope:'local'});
        password.value='';otp.value='';
        setMode('login');
        message('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.');
      }
    }catch(error){message(emailError(error));}
    finally{busy=false;submit.disabled=false;}
  }
  form.addEventListener('submit',submitRequest);
  loginTab.addEventListener('click',()=>setMode('login'));
  signupTab.addEventListener('click',()=>setMode('signup'));
  codeTab.addEventListener('click',()=>setMode('verify'));
  secondary.addEventListener('click',async()=>{
    if(busy)return;
    // Do not initiate password recovery in a page where the normal sign-in
    // listener can consume the temporary recovery session. Enter isolated
    // reset-only mode first, without putting email addresses in URLs/storage.
    if(mode!=='verify'&&mode!=='reset'){
      location.assign(isolatedRecoveryPath(location.search));
      return;
    }
    const address=String(email.value||'').trim().toLowerCase();
    if(!validEmail(address)){message('먼저 이메일 주소를 입력해 주세요.');return;}
    busy=true;secondary.disabled=true;
    try{
      if(mode==='verify'){
        const {error}=await supabase.auth.resend({type:'signup',email:address,
          options:{emailRedirectTo:emailReturnUrl()}});
        if(error)throw error;
      }else{
        const {error}=await supabase.auth.resetPasswordForEmail(address,{
          redirectTo:new URL(isolatedRecoveryPath(location.search),ORIGIN).toString()
        });
        if(error)throw error;
      }
      message('메일 발송을 요청했습니다. 받은 편지함과 스팸함을 확인해 주세요.');
    }catch(error){message(emailError(error));}
    finally{busy=false;secondary.disabled=false;}
  });
  setMode(mode);
  return true;
}
