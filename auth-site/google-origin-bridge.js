(()=>{
  'use strict';
  const EXPECTED_CLIENT='483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5.apps.googleusercontent.com';
  const TARGET_ORIGIN='https://ekodi.kr';
  const params=new URLSearchParams(location.search);
  const waitMode=params.get('wait')==='1';
  const status=document.getElementById('status');
  const host=document.getElementById('googleButton');
  let readyTimer=0;
  let waitTimeout=0;
  let started=false;
  const fail=message=>{status.textContent=message;status.dataset.state='error'};
  const validRequest=(clientId,nonce,state)=>/^[a-f0-9]{48}$/i.test(nonce)&&/^[a-zA-Z0-9._-]{12,160}$/.test(state)&&clientId===EXPECTED_CLIENT;
  if(!window.opener){fail('인증을 시작한 EKODI 창을 찾을 수 없습니다.');return}

  const finishReady=()=>{
    if(readyTimer){clearInterval(readyTimer);readyTimer=0}
    if(waitTimeout){clearTimeout(waitTimeout);waitTimeout=0}
    window.removeEventListener('message',onStartMessage);
  };
  const notifyReady=()=>{try{window.opener.postMessage({type:'ekodi-google-origin-bridge-ready'},TARGET_ORIGIN)}catch{}};
  const startGoogle=(clientId,nonce,state)=>{
    if(started)return;
    if(!validRequest(clientId,nonce,state)){finishReady();fail('유효하지 않은 인증 요청입니다. 창을 닫고 다시 시도해 주세요.');return}
    started=true;finishReady();
    const boot=()=>{
      if(!window.google?.accounts?.id){setTimeout(boot,80);return}
      try{
        google.accounts.id.initialize({client_id:clientId,nonce,auto_select:false,use_fedcm_for_button:false,button_auto_select:false,ux_mode:'popup',context:'signin',callback:response=>{
          if(!response?.credential){fail('Google 인증이 완료되지 않았습니다.');return}
          window.opener.postMessage({type:'ekodi-google-origin-bridge',state,nonce,credential:response.credential},TARGET_ORIGIN);
          status.textContent='인증이 완료되었습니다. EKODI로 돌아갑니다.';
          setTimeout(()=>window.close(),120);
        }});
        host.replaceChildren();
        google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',width:320});
        status.textContent='Google 계정 선택창을 여는 중입니다. 열리지 않으면 아래 버튼을 눌러 주세요.';
        try{
          google.accounts.id.prompt(notification=>{
            const notDisplayed=Boolean(notification?.isNotDisplayed?.());
            const skipped=Boolean(notification?.isSkippedMoment?.());
            if(notDisplayed||skipped)status.textContent='Google 계정 선택창이 자동으로 열리지 않았습니다. 아래 버튼을 눌러 주세요.';
          });
        }catch(error){console.warn('google prompt fallback',error);status.textContent='아래 Google 버튼을 눌러 계정을 선택해 주세요.'}
      }catch(error){console.error('google origin bridge',error);fail('Google 인증을 준비하지 못했습니다. 다시 시도해 주세요.')}
    };
    boot();
  };
  function onStartMessage(event){
    if(event.origin!==TARGET_ORIGIN||event.source!==window.opener)return;
    const data=event.data||{};
    if(data.type!=='ekodi-google-origin-bridge-start')return;
    startGoogle(String(data.clientId||'').trim(),String(data.nonce||'').trim(),String(data.state||'').trim());
  }

  if(waitMode){
    status.textContent='EKODI 관리자 인증 요청을 기다리고 있습니다.';
    window.addEventListener('message',onStartMessage);
    notifyReady();
    readyTimer=setInterval(notifyReady,250);
    waitTimeout=setTimeout(()=>{if(!started){finishReady();fail('관리자 인증 연결 시간이 초과되었습니다. 창을 닫고 다시 시도해 주세요.')}},15000);
    return;
  }

  startGoogle(String(params.get('client_id')||'').trim(),String(params.get('nonce')||'').trim(),String(params.get('state')||'').trim());
})();
