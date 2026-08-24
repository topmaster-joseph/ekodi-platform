import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const authBase=cfg.authUrl||'https://auth.ekodi.kr/?site=my';
const SKIP_PROBE='ekodi_my_skip_sso_probe';
const PROBE_MARK='sso_checked';

function injectLayout(){
  if(document.getElementById('ekodi-auth-session-layout'))return;
  const style=document.createElement('style');
  style.id='ekodi-auth-session-layout';
  style.textContent=`
body[data-auth-state="checking"] main>section:not(.welcome-shell),body[data-auth-state="checking"] footer{visibility:hidden}
body[data-auth-state="signed-out"] .topbar nav,body[data-auth-state="signed-out"] .workspace-control,body[data-auth-state="signed-out"] .identity-card,body[data-auth-state="signed-out"] main>section:not(.welcome-shell){display:none!important}
body[data-auth-state="signed-out"] .welcome-shell{grid-template-columns:minmax(0,760px);min-height:calc(100vh - 150px);align-content:center;justify-content:center;padding-top:64px;padding-bottom:64px}
body[data-auth-state="signed-out"] .welcome-copy{padding:0;text-align:left}
body[data-auth-state="signed-out"] .welcome-copy h1{max-width:720px}
body[data-auth-state="signed-out"] .welcome-copy .lead{max-width:700px}
.my-login-entry{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:28px}
.my-login-entry .primary{min-width:168px}
.my-login-entry small{max-width:420px;color:var(--user-muted);line-height:1.55}
body[data-auth-state="signed-in"] #platforms{padding-top:24px;padding-bottom:38px}
body[data-auth-state="signed-in"] #platforms .platform-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
body[data-auth-state="signed-in"] #platforms .platform-card{min-height:158px;padding:17px}
body[data-auth-state="signed-in"] #platforms .platform-card p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:0;font-size:12px;line-height:1.5;margin:7px 0 10px}
body[data-auth-state="signed-in"] #platforms .platform-card h3{font-size:17px;margin:4px 0}
body[data-auth-state="signed-in"] #platforms .card-link{padding-top:10px;font-size:12px}
body[data-auth-state="signed-in"] .summary{margin-top:8px;margin-bottom:8px}
@media(max-width:980px){body[data-auth-state="signed-in"] #platforms .platform-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){body[data-auth-state="signed-out"] .welcome-shell{min-height:calc(100vh - 110px);padding-top:36px;padding-bottom:44px}body[data-auth-state="signed-out"] .topbar{justify-content:space-between}body[data-auth-state="signed-out"] .topbar #authButton{display:inline-flex!important}}
@media(max-width:540px){body[data-auth-state="signed-in"] #platforms .platform-grid{grid-template-columns:1fr}body[data-auth-state="signed-in"] #platforms .platform-card{min-height:auto}.my-login-entry{align-items:stretch;flex-direction:column}.my-login-entry .primary{width:100%}}
`;
  document.head.append(style);
}

function cleanReturnUrl(){
  const target=new URL(location.href);
  target.searchParams.delete(PROBE_MARK);
  target.searchParams.delete('auth');
  return target;
}

function authUrl({probe=false}={}){
  const target=cleanReturnUrl();
  if(probe){
    target.searchParams.set(PROBE_MARK,'1');
  }
  const auth=new URL(authBase,location.origin);
  auth.searchParams.set('site','my');
  auth.searchParams.set('return_to',target.href);
  if(probe)auth.searchParams.set('probe','1');
  else auth.searchParams.delete('probe');
  return auth.href;
}

function ensureSignedOutEntry(){
  const copy=document.querySelector('.welcome-copy');
  if(!copy||copy.querySelector('.my-login-entry'))return;
  const wrap=document.createElement('div');
  wrap.className='my-login-entry';
  const button=document.createElement('button');
  button.className='primary';
  button.type='button';
  button.textContent='EKODI 시작하기';
  button.addEventListener('click',()=>location.assign(authUrl()));
  const note=document.createElement('small');
  note.textContent='Google 확인은 처음 한 번만 필요합니다. 이미 EKODI에 로그인했다면 계정을 다시 고르지 않고 바로 연결됩니다.';
  wrap.append(button,note);
  copy.append(wrap);
}

function arrangeSignedInHome(){
  const main=document.querySelector('main#home');
  const welcome=main?.querySelector('.welcome-shell');
  const summary=main?.querySelector('.summary');
  const platforms=main?.querySelector('#platforms');
  const recommendations=main?.querySelector('#recommendations');
  const workspaces=main?.querySelector('#workspaces');
  if(!main||!welcome)return;
  let cursor=welcome;
  for(const node of [summary,platforms,recommendations,workspaces]){
    if(!node)continue;
    cursor.after(node);
    cursor=node;
  }
  document.documentElement.dataset.myHomeOrder='overview-first';
}

function setState(state){
  document.body.dataset.authState=state;
  if(state==='signed-out')ensureSignedOutEntry();
  if(state==='signed-in')arrangeSignedInHome();
}

function markLocalLogout(){
  try{sessionStorage.setItem(SKIP_PROBE,'1')}catch{}
}
function skipProbe(){
  try{return sessionStorage.getItem(SKIP_PROBE)==='1'}catch{return false}
}
function clearSkipProbe(){
  try{sessionStorage.removeItem(SKIP_PROBE)}catch{}
}

async function maybeProbe(session){
  if(session||!enabled||!sb)return false;
  const params=new URLSearchParams(location.search);
  const hasHandoff=new URLSearchParams(location.hash.replace(/^#/,''))?.has('ekodi_token');
  if(hasHandoff||params.get(PROBE_MARK)==='1'||params.get('auth')==='required'||skipProbe())return false;
  setState('checking');
  location.replace(authUrl({probe:true}));
  return true;
}

async function start(){
  injectLayout();
  setState('checking');
  if(!enabled||!sb){setState('signed-out');return;}
  const {data}=await sb.auth.getSession();
  const current=data.session||null;
  if(await maybeProbe(current))return;
  if(current){
    clearSkipProbe();
    setState('signed-in');
    const cleaned=cleanReturnUrl();
    if(cleaned.href!==location.href)history.replaceState({},document.title,cleaned.href);
  }else setState('signed-out');

  sb.auth.onAuthStateChange((event,next)=>{
    queueMicrotask(()=>{
      if(event==='SIGNED_OUT'){setState('signed-out');return;}
      if(next){clearSkipProbe();setState('signed-in')}
    });
  });

  for(const id of ['authButton','accountAuthButton']){
    document.getElementById(id)?.addEventListener('click',()=>{
      if(document.body.dataset.authState==='signed-in')markLocalLogout();
    },{capture:true});
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
else void start();
