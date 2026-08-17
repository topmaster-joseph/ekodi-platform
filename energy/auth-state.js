import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
const workspaceSwitch=document.getElementById('workspaceSwitch');
const modeCard=document.querySelector('.mode-card');
const refreshInsight=document.getElementById('refreshInsight');
const memberNav=[...document.querySelectorAll('[data-view="devices"],[data-view="manager"]')];

function loginHref(){
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site','energy');
  target.searchParams.set('return_to',location.href.split('#')[0]);
  return target.href;
}

function showOverview(){
  document.querySelectorAll('.nav-link').forEach((button)=>button.classList.toggle('active',button.dataset.view==='overview'));
  document.querySelectorAll('.view').forEach((view)=>view.classList.toggle('active',view.id==='overviewView'));
}

function apply(session){
  const signedIn=Boolean(session?.user);
  document.body.dataset.authState=signedIn?'member':'guest';
  if(modeCard)modeCard.hidden=!signedIn;
  if(refreshInsight){refreshInsight.hidden=!signedIn;refreshInsight.disabled=!signedIn;}
  memberNav.forEach((button)=>button.hidden=!signedIn);

  if(!signedIn){
    showOverview();
    if(workspaceSwitch){
      workspaceSwitch.textContent='Google로 시작';
      workspaceSwitch.href=loginHref();
      workspaceSwitch.title='로그인 후 내 에너지 Workspace와 AI 관리 기능을 사용합니다.';
      workspaceSwitch.classList.add('guest-login');
    }
  }else if(workspaceSwitch){
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
