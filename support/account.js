const config=window.EKODI_SUPPORT_CONFIG?.centralIdentity||{};
const host=document.getElementById('ekodiAccount');
const text=document.getElementById('ekodiAccountText');
const action=document.getElementById('ekodiAccountAction');
const detail=document.getElementById('ekodiAccountDetail');

const state={client:null,session:null,profile:null,enabled:Boolean(config.enabled&&config.supabaseUrl&&config.publishableKey&&config.profileApi)};
const emit=detail=>window.dispatchEvent(new CustomEvent('ekodi:support-account',{detail}));
const setUi=(label,buttonLabel='',mode='local',message='')=>{
  if(!host)return;
  host.dataset.state=mode;
  if(text)text.textContent=label;
  if(action){action.textContent=buttonLabel;action.hidden=!buttonLabel;}
  if(detail){detail.textContent=message;detail.hidden=!message;}
};
const cleanReturnUrl=()=>{const url=new URL(location.href);url.hash='';return url.href;};
const loginUrl=()=>{const target=new URL(config.authUrl||'https://auth.ekodi.kr/?site=support');target.searchParams.set('site','support');target.searchParams.set('return_to',cleanReturnUrl());return target.href;};
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
  setUi(label,'로그아웃','signed-in','My EKODI 신원 연결됨 · 지원조건은 별도 최소정보로 관리');
  emit({signedIn:true,displayName,email,status:profile?.profile?.status||'active'});
}
async function bootstrap(){
  if(!host)return;
  if(!state.enabled){
    setUi(config.modeLabel||'로컬 모드','', 'local', config.disabledReason||'중앙 계정 연결 없이 이 브라우저에서 이용합니다.');
    emit({signedIn:false,mode:'local',centralIdentityEnabled:false});
    return;
  }
  setUi('계정 확인 중','','loading','EKODI 중앙 로그인 상태를 확인합니다.');
  try{
    const {createClient}=await importClient();
    state.client=createClient(config.supabaseUrl,config.publishableKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
    await consumeHandoff(state.client);
    const {data,error}=await state.client.auth.getSession();
    if(error)throw error;
    state.session=data.session||null;
    if(!state.session){
      setUi('로그인하지 않음','EKODI 로그인','signed-out','로그인하지 않아도 로컬 조건으로 기회를 찾을 수 있습니다.');
      emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
      return;
    }
    state.profile=await loadProfile(state.session);
    announce(state.profile,state.session);
  }catch(error){
    console.warn('support central identity unavailable',error);
    setUi('로컬 모드','EKODI 로그인','degraded','중앙 계정 연결에 실패해도 기회 탐색은 계속 사용할 수 있습니다.');
    emit({signedIn:false,mode:'degraded',centralIdentityEnabled:true});
  }
}
if(action){
  action.addEventListener('click',async()=>{
    if(state.session&&state.client){
      try{await state.client.auth.signOut()}catch(error){console.warn('support sign out',error)}
      state.session=null;state.profile=null;
      setUi('로그인하지 않음','EKODI 로그인','signed-out','이 브라우저의 Support 로그인 연결을 해제했습니다.');
      emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
      return;
    }
    location.assign(loginUrl());
  });
}

bootstrap();
