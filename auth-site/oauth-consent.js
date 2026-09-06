import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const $=id=>document.getElementById(id);
const authorizationId=String(new URLSearchParams(location.search).get('authorization_id')||'').trim();
let busy=false;

function setStatus(message,error=false){
  $('status').textContent=message;
  $('status').style.color=error?'#9b2c2c':'';
}
function loginUrl(){
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site','oauth');
  target.searchParams.set('return_to',location.href);
  return target.href;
}
function scopeLabel(scope){
  const labels={openid:'EKODI 로그인 확인',email:'계정 이메일 확인',profile:'EKODI 프로필 확인'};
  return labels[scope]||scope;
}
function safeRedirect(value){
  const url=String(value||'').trim();
  if(!/^https:\/\//i.test(url))throw new Error('oauth_redirect_invalid');
  location.assign(url);
}
async function decide(approve){
  if(busy||!authorizationId)return;
  busy=true;$('approve').disabled=true;$('deny').disabled=true;
  setStatus(approve?'연결을 승인하고 있습니다.':'연결을 취소하고 있습니다.');
  const operation=approve?sb.auth.oauth.approveAuthorization.bind(sb.auth.oauth):sb.auth.oauth.denyAuthorization.bind(sb.auth.oauth);
  const {data,error}=await operation(authorizationId);
  if(error){busy=false;$('approve').disabled=false;$('deny').disabled=false;setStatus(error.message||'연결 처리에 실패했습니다.',true);return;}
  try{safeRedirect(data?.redirect_url)}catch{setStatus('안전한 돌아갈 주소를 확인하지 못했습니다.',true)}
}

async function load(){
  if(!authorizationId){setStatus('유효한 AI 연결 요청이 없습니다.',true);return;}
  const {data:{user}}=await sb.auth.getUser();
  if(!user){location.replace(loginUrl());return;}
  const {data,error}=await sb.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error||!data){setStatus(error?.message||'연결 요청을 확인할 수 없습니다.',true);return;}
  if(!Object.prototype.hasOwnProperty.call(data,'authorization_id')){
    try{safeRedirect(data.redirect_url)}catch{setStatus('기존 연결의 돌아갈 주소를 확인하지 못했습니다.',true)}
    return;
  }
  const scopes=String(data.scope||'').split(/\s+/).filter(Boolean);
  $('clientName').textContent=String(data.client?.name||'외부 AI 앱');
  $('redirectUri').textContent=String(data.redirect_uri||'승인된 앱 주소');
  $('scopes').replaceChildren(...scopes.map(scope=>{
    const li=document.createElement('li');li.textContent=scopeLabel(scope);return li;
  }));
  $('title').textContent=`${String(data.client?.name||'AI 앱')}에서 EKODI 연결을 요청했습니다`;
  $('details').hidden=false;$('actions').hidden=false;
  setStatus('요청된 범위를 확인한 뒤 연결 여부를 선택해 주세요.');
}

$('approve').addEventListener('click',()=>decide(true));
$('deny').addEventListener('click',()=>decide(false));
load().catch(error=>{console.error('EKODI OAuth consent',error);setStatus('AI 연결 요청을 처리하지 못했습니다.',true)});
