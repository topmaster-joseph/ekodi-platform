// EKODI 동행 성인 본인인증(포트원 V2). 결과 확인과 저장은 서버(singles-api)만 한다.
(() => {
'use strict';
const $=id=>document.getElementById(id);
const say=(t,error=false)=>{const n=$('verifyStatus');n.textContent=t;n.className=error?'notice error':'notice'};
const ERR={
 identity_provider_not_configured:'본인인증 연동을 준비하고 있습니다. 잠시 후 다시 이용해 주세요.',
 membership_required:'먼저 "내 정보"에서 참여 동의를 저장해 주세요.',
 identity_rate_limited:'오늘 본인인증 시도 횟수를 넘었습니다. 내일 다시 시도해 주세요.',
 identity_not_verified:'본인인증이 완료되지 않았습니다. 다시 시도해 주세요.',
 identity_provider_unavailable:'인증기관 확인이 지연되고 있습니다. 잠시 후 이 화면을 새로고침해 주세요.',
 adult_required:'만 19세 이상만 가입할 수 있습니다.',
 identity_already_used:'이미 다른 에코디 계정에서 본인인증된 분입니다. 한 사람은 한 계정만 이용할 수 있습니다.',
 identity_key_missing:'이 인증 수단으로는 중복 가입 확인이 되지 않습니다. 휴대폰(통신사) 인증으로 다시 시도해 주세요.',
 identity_already_completed:'이미 처리된 인증입니다. 동행 안내·가입 화면에서 상태를 확인해 주세요.',
 pilot_only:'지금은 시범 운영 중이라 지정된 계정만 이용할 수 있습니다.'
};
let client=null;
async function token(){const {data}=await client.auth.getSession();if(!data?.session?.access_token)throw Error('login_required');return data.session.access_token}
async function api(path,body){
 const r=await fetch('/singles/api'+path,{method:'POST',headers:{authorization:'Bearer '+await token(),'content-type':'application/json'},body:JSON.stringify(body||{}),cache:'no-store',credentials:'omit'});
 const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||'server_unavailable');e.status=r.status;throw e}return d;
}
const message=e=>ERR[e?.message]||(e?.message==='login_required'?'로그인이 필요합니다.':'처리하지 못했습니다. 다시 시도해 주세요.');
function loadSdk(){
 if(window.PortOne)return Promise.resolve(window.PortOne);
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.portone.io/v2/browser-sdk.js';s.async=true;
  s.onload=()=>window.PortOne?resolve(window.PortOne):reject(Error('sdk'));s.onerror=()=>reject(Error('sdk'));document.head.append(s)});
}
async function complete(id){
 say('인증 결과를 확인하고 있습니다…');
 try{await api('/identity/complete',{identity_verification_id:id});
  say('성인 본인인증이 완료되었습니다. 이제 유료회원 가입을 진행할 수 있습니다.');
  const a=document.createElement('a');a.href='/singles/subscribe';a.className='primary';a.textContent='동행 안내·가입으로 이동';$('verifyStatus').after(a);
  $('verifyStart').hidden=true;
 }catch(e){say(message(e),true);$('verifyStart').hidden=false}
}
async function main(){
 const status=await fetch('/singles/api/status',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);
 const cfg=status?.identity_verification;
 if(!cfg){say(ERR.identity_provider_not_configured);return}
 if(typeof window.supabase?.createClient!=='function'){say('로그인 모듈을 불러오지 못했습니다.',true);return}
 client=window.supabase.createClient(status.auth?.supabase_url||'https://renzehysxirjilvdxacv.supabase.co',status.auth?.publishable_key||'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data}=await client.auth.getSession();
 if(!data?.session){say('로그인 후 이용할 수 있습니다.');const a=document.createElement('a');a.className='primary';a.textContent='EKODI 로그인';
  a.href='https://ekodi.kr/auth/?site=singles&select_account=1&return_to='+encodeURIComponent('https://ekodi.kr/singles/verify');$('verifyStatus').after(a);return}
 // 모바일 등 리디렉션 방식: 인증 후 이 페이지로 돌아온다.
 const q=new URLSearchParams(location.search),back=q.get('identityVerificationId');
 if(back){history.replaceState(null,'','/singles/verify');
  if(q.get('code')){say('본인인증이 취소되었거나 실패했습니다. 다시 시도해 주세요.',true);$('verifyStart').hidden=false}
  else await complete(back);
 }else{say('아래 버튼을 눌러 휴대폰 본인인증을 진행해 주세요.');$('verifyStart').hidden=false}
 $('verifyStart').addEventListener('click',async()=>{
  $('verifyStart').disabled=true;
  try{
   const start=await api('/identity/start');
   if(start.already_verified){say('이미 성인 본인인증이 완료된 계정입니다.');return}
   const PortOne=await loadSdk();
   const r=await PortOne.requestIdentityVerification({storeId:cfg.store_id,channelKey:cfg.channel_key,identityVerificationId:start.identity_verification_id,redirectUrl:'https://ekodi.kr/singles/verify'});
   if(r?.code){say('본인인증이 취소되었거나 실패했습니다. 다시 시도해 주세요.',true);return}
   await complete(start.identity_verification_id);
  }catch(e){say(e?.message==='sdk'?'인증 창을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.':message(e),true)}
  finally{$('verifyStart').disabled=false}
 });
}
main().catch(()=>say('연결을 확인하지 못했습니다. 새로고침해 주세요.',true));
})();
