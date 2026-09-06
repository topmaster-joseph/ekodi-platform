const config=window.EKODI_DELIVERY_CONFIG?.centralIdentity||{};
const host=document.getElementById('ekodiAccount');
const text=document.getElementById('ekodiAccountText');
const action=document.getElementById('ekodiAccountAction');
const detail=document.getElementById('ekodiAccountDetail');
const heroLogin=document.getElementById('heroLogin');

const state={client:null,session:null,profile:null,enabled:Boolean(config.enabled&&config.supabaseUrl&&config.publishableKey&&config.profileApi)};
const emit=payload=>{window.EKODI_DELIVERY_ACCOUNT_STATE=payload;window.dispatchEvent(new CustomEvent('ekodi:delivery-account',{detail:payload}));};
const setUi=(label,buttonLabel='',mode='public',message='')=>{
  if(host)host.dataset.state=mode;
  if(text)text.textContent=label;
  if(action){action.textContent=buttonLabel;action.hidden=!buttonLabel;}
  if(detail){detail.textContent=message;detail.hidden=!message;}
};
const cleanReturnUrl=()=>{const url=new URL(location.href);url.hash='';return url.href;};
const loginUrl=()=>{const target=new URL(config.authUrl||'https://auth.ekodi.kr/?site=delivery');target.searchParams.set('site','delivery');target.searchParams.set('return_to',cleanReturnUrl());return target.href;};
async function importClient(){
  try{return await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')}
  catch{return import('https://esm.sh/@supabase/supabase-js@2?bundle')}
}
async function consumeHandoff(client){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const tokenHash=hash.get('ekodi_token');
  if(!tokenHash)return false;
  const type=hash.get('ekodi_type')||'email';
  const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type});
  if(error)throw error;
  history.replaceState(null,'',location.pathname+location.search);
  return true;
}
async function loadProfile(session){
  const response=await fetch(config.profileApi,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.publishableKey},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`profile_${response.status}`);
  return data;
}
function announce(profile,session){
  const displayName=String(profile?.profile?.display_name||'').trim();
  const email=String(profile?.user?.email||session?.user?.email||'').trim();
  const label=displayName||email||'EKODI 회원';
  setUi(label,'로그아웃','signed-in','무료회원 운영공간 연결됨');
  emit({signedIn:true,displayName,email,status:profile?.profile?.status||'active'});
}
async function bootstrap(){
  if(!host)return;
  if(!state.enabled){
    setUi('로그인 필요','EKODI 로그인','public',config.disabledReason||'중앙 로그인 연결을 확인할 수 없습니다.');
    emit({signedIn:false,mode:'public',centralIdentityEnabled:false});
    return;
  }
  setUi('계정 확인 중','','loading','EKODI 로그인 상태를 확인합니다.');
  try{
    const {createClient}=await importClient();
    state.client=createClient(config.supabaseUrl,config.publishableKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
    await consumeHandoff(state.client);
    const {data,error}=await state.client.auth.getSession();
    if(error)throw error;
    state.session=data.session||null;
    if(!state.session){
      setUi('로그인하지 않음','EKODI 로그인','signed-out','로그인 전에는 서비스 안내만 볼 수 있습니다.');
      emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
      return;
    }
    state.profile=await loadProfile(state.session);
    announce(state.profile,state.session);
  }catch(error){
    console.warn('delivery central identity unavailable',error);
    setUi('계정 연결 확인 필요','EKODI 로그인','degraded','로그인 연결을 확인하지 못해 운영공간을 잠갔습니다.');
    emit({signedIn:false,mode:'degraded',centralIdentityEnabled:true});
  }
}
async function accountAction(){
  if(state.session&&state.client){
    try{await state.client.auth.signOut()}catch(error){console.warn('delivery sign out',error)}
    state.session=null;state.profile=null;
    setUi('로그인하지 않음','EKODI 로그인','signed-out','운영공간이 잠겼습니다.');
    emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
    return;
  }
  location.assign(loginUrl());
}
if(action)action.addEventListener('click',accountAction);
if(heroLogin)heroLogin.addEventListener('click',accountAction);
bootstrap();
