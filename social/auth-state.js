import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
const workspaceSwitch=document.getElementById('workspaceSwitch');

function loginHref(){
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site','social');
  target.searchParams.set('return_to',location.href.split('#')[0]);
  return target.href;
}

function apply(session){
  const signedIn=Boolean(session?.user);
  document.body.dataset.authState=signedIn?'member':'guest';
  if(!workspaceSwitch)return;
  if(!signedIn){
    workspaceSwitch.textContent='Google로 시작';
    workspaceSwitch.href=loginHref();
    workspaceSwitch.title='로그인 후 내 Workspace와 소셜 연결 상태를 확인합니다.';
    workspaceSwitch.classList.add('guest-login');
  }else{
    workspaceSwitch.classList.remove('guest-login');
    if(!workspaceSwitch.textContent||workspaceSwitch.textContent==='Google로 시작'){
      workspaceSwitch.textContent='Workspace 선택 ▾';
      workspaceSwitch.href='https://my.ekodi.kr/#workspaces';
      workspaceSwitch.title='My EKODI에서 Workspace 선택';
    }
  }
}

const {data}=await sb.auth.getSession();
apply(data.session);
sb.auth.onAuthStateChange((_event,session)=>apply(session));
