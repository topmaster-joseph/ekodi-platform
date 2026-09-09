(()=>{
  'use strict';
  const EXPECTED_CLIENT='483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5.apps.googleusercontent.com';
  const TARGET_ORIGIN='https://ekodi.kr';
  const params=new URLSearchParams(location.search);
  const clientId=String(params.get('client_id')||'').trim();
  const nonce=String(params.get('nonce')||'').trim();
  const state=String(params.get('state')||'').trim();
  const status=document.getElementById('status');
  const host=document.getElementById('googleButton');
  const fail=message=>{status.textContent=message;status.dataset.state='error'};
  const valid=/^[a-f0-9]{48}$/i.test(nonce)&&/^[a-zA-Z0-9._-]{12,160}$/.test(state)&&clientId===EXPECTED_CLIENT;
  if(!valid){fail('유효하지 않은 인증 요청입니다. 창을 닫고 다시 시도해 주세요.');return}
  if(!window.opener){fail('인증을 시작한 EKODI 창을 찾을 수 없습니다.');return}
  const start=()=>{
    if(!window.google?.accounts?.id){setTimeout(start,80);return}
    try{
      google.accounts.id.initialize({client_id:clientId,nonce,auto_select:false,use_fedcm_for_button:false,button_auto_select:false,ux_mode:'popup',context:'signin',callback:response=>{
        if(!response?.credential){fail('Google 인증이 완료되지 않았습니다.');return}
        window.opener.postMessage({type:'ekodi-google-origin-bridge',state,nonce,credential:response.credential},TARGET_ORIGIN);
        status.textContent='인증이 완료되었습니다. EKODI로 돌아갑니다.';
        setTimeout(()=>window.close(),120);
      }});
      google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:320});
      status.textContent='Google 계정을 선택해 주세요.';
    }catch(error){console.error('google origin bridge',error);fail('Google 인증을 준비하지 못했습니다. 다시 시도해 주세요.')}
  };
  start();
})();